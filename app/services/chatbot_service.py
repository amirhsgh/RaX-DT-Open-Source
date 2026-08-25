"""
Chatbot service - a deep agent (deepagents) for Virtual Screening guidance.

Rewritten from a hand-rolled 4-node LangGraph StateGraph (input -> memory ->
llm -> output) to deepagents' create_deep_agent(). The public interface
(process_message/get_session_history/clear_session/get_user_sessions/
health_check) and the DB-backed conversation persistence are unchanged -
app/api/chat.py and the ChatSession table don't need to know anything
changed underneath. What's different: the agent now has a real tool-use
loop (deepagents' built-in planning, scratch-file, and subagent-delegation
tools) instead of a single prompt-and-respond LLM call, so it can work
through multi-step guidance rather than answering in one shot.
"""

import os
import re
import uuid
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from uuid import uuid4

from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from deepagents import create_deep_agent
from sqlalchemy import select

from app.database.connection import get_sync_database
from app.database.models import ChatSession, Project, ScreeningJob
from app.services.agent_tools import build_agent_tools

logger = logging.getLogger(__name__)


class ChatbotService:
    """
    Chatbot service using a deepagents deep agent for stateful conversation
    guidance, backed by OpenAI. Conversation history/context persistence
    stays in Postgres (ChatSession) rather than deepagents' own
    checkpointer, so the existing session-history/list/clear API surface
    keeps working unchanged.
    """

    def __init__(self):
        self.llm = None
        self._initialize_llm()

    def _initialize_llm(self):
        """Initialize the OpenAI LLM."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not found. Chatbot will use mock responses.")
            return

        try:
            self.llm = ChatOpenAI(
                # The old "gpt-4-1106-preview" (GPT-4 Turbo preview, Nov 2023)
                # has been retired by OpenAI - every real call 404'd with
                # "model_not_found" (found live, testing this rewrite: the
                # chatbot was already broken before this change). gpt-4o is
                # the current, non-preview GPT-4-class model.
                model="gpt-4o",
                temperature=0.3,  # Slightly creative but focused
                max_tokens=1000,
                api_key=api_key
            )
            logger.info("OpenAI LLM initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI LLM: {e}")

    def _build_agent(self, user_context: Dict[str, Any], user_id: str, session_id: str):
        """Build a deep agent with a system prompt tailored to this
        conversation's current user_context. Rebuilt per message (like the
        old code rebuilt its prompt per message) rather than cached, since
        construction is just graph wiring - no network call - and the
        context (user level, current workflow step) can change every turn.

        Tools are bound to this user + session, so the agent can inspect the
        files uploaded in this chat and start/monitor that user's jobs
        without ever choosing whose data it operates on.
        """
        return create_deep_agent(
            model=self.llm,
            tools=build_agent_tools(user_id, session_id),
            system_prompt=self._create_system_prompt(user_context),
            name="virtual_screening_assistant",
        )

    def _create_system_prompt(self, user_context: Dict[str, Any]) -> str:
        """Create a dynamic system prompt based on user context."""
        base_prompt = """You are a Virtual Screening Assistant, an expert AI specialized in helping researchers with computational drug discovery and molecular docking workflows.

Your primary role is to:
1. Guide users through the virtual screening process step-by-step
2. Explain complex concepts in an accessible way
3. Validate user approaches and suggest best practices
4. Help troubleshoot common issues
5. Provide specific, actionable advice

Key areas of expertise:
- Protein preparation and structure validation
- Ligand preparation and conformer generation
- Molecular docking setup and parameters
- Result interpretation and analysis
- Virtual screening pipeline optimization
- File format conversions and compatibility
- Common tools: GNINA, AutoDock Vina, OpenBabel, RDKit

Communication style:
- Be friendly, encouraging, and patient
- Break down complex processes into clear steps
- Use emojis appropriately to make responses engaging
- Ask clarifying questions when needed
- Provide specific examples when possible
- Always verify the user's understanding

You can DO things, not just explain them. Available actions:
- list_uploaded_files(): see what the user has attached in this chat and what
  each file was detected as (protein receptor / ligands / reference ligand)
- list_recent_jobs(): the user's recent docking jobs and their progress
- get_job_details(job_id): full status of one job, including errors
- start_docking_job(job_name): create and start a real docking run from the
  files uploaded in this chat

Rules for running jobs:
- A run needs at least a protein receptor (.pdb/.pdbqt) and a ligand file
  (.sdf/.mol2/.smi). Check list_uploaded_files() before promising anything.
- If something is missing, tell the user exactly what to attach - they can use
  the paperclip button or drag the file into the chat. They do NOT need to say
  what kind of file it is; it is detected automatically.
- If the user names a compound instead of uploading it, ask them to upload its
  structure file (.sdf/.mol2/.smi) - there is no built-in compound library.
- A reference ligand is optional but strongly recommended: it centres the
  search box on the real binding site. Say so when one is missing.
- NEVER call start_docking_job until the user has explicitly confirmed. Show
  them what will be used (which receptor, which ligands, whether the box is
  auto-centred) and ask for a yes first. A docking run costs real compute time.
- After starting, tell them it is now visible in the Running jobs panel.
- NEVER say a job has started unless start_docking_job actually returned a
  job id to you in THIS turn. Earlier messages in this conversation may
  describe runs you started before - those are history, not this request.
  When the user asks for a new run, call the tool again; do not assume it is
  already handled because a previous message says something similar.
- Same rule for status: only report progress that list_recent_jobs or
  get_job_details returned to you just now. Never recall it from memory.

You are talking to clinicians and bench researchers, not software engineers.
Never mention file paths, job UUIDs (unless they ask), APIs, or internal tool
names. Say "your receptor file", not "protein_file_path".

Write plain text only - the chat does not render LaTeX or maths markup. Write
"alpha-Tocopherol", never "\\(\\alpha\\)-Tocopherol".

You also have planning and scratch-file tools - use them for genuinely
multi-step guidance (e.g. walking through a full protein-to-results
pipeline), not for simple one-line answers.

Current conversation context:"""

        # Add user context information
        context_info = []
        if user_context.get("user_level"):
            context_info.append(f"User level: {user_context['user_level']}")
        if user_context.get("current_workflow_step"):
            context_info.append(f"Current workflow step: {user_context['current_workflow_step']}")
        if user_context.get("topics_discussed"):
            context_info.append(f"Topics discussed: {', '.join(user_context['topics_discussed'])}")

        if context_info:
            base_prompt += "\n- " + "\n- ".join(context_info)

        base_prompt += """\n\nRemember to:
- Always provide actionable next steps
- Reference specific features of the Virtual Screening application when relevant
- Encourage best practices in computational drug discovery
- Be patient with beginners and detailed with advanced users"""

        return base_prompt

    def _load_context_and_history(self, user_id: str, session_id: str) -> tuple[Dict[str, Any], List[BaseMessage]]:
        """Load stored user_context + recent message history for this
        session, creating a new ChatSession row if none exists yet."""
        default_context = {
            "topics_discussed": [],
            "user_level": "beginner",  # beginner, intermediate, advanced
            "current_workflow_step": None,
            "preferred_guidance_style": "step-by-step"
        }

        try:
            with get_sync_database() as db:
                chat_session = db.query(ChatSession).filter(
                    ChatSession.user_id == user_id,
                    ChatSession.session_id == session_id,
                    ChatSession.is_active == True
                ).first()

                if chat_session:
                    context = chat_session.user_context or default_context
                    history: List[BaseMessage] = []
                    conversation_data = chat_session.conversation_data or {}
                    for msg in conversation_data.get("messages", [])[-10:]:  # Last 10 messages
                        if msg["type"] == "user":
                            history.append(HumanMessage(content=msg["content"]))
                        else:
                            history.append(AIMessage(content=msg["content"]))
                    return context, history

                new_chat_session = ChatSession(
                    user_id=user_id,
                    session_id=session_id,
                    user_context=default_context,
                    conversation_data={"messages": []}
                )
                db.add(new_chat_session)
                db.commit()
                return default_context, []

        except Exception as e:
            logger.error(f"Error loading chat session: {e}")
            return default_context, []

    def _save_context_and_history(
        self, user_id: str, session_id: str, user_context: Dict[str, Any], messages: List[BaseMessage],
    ):
        """Persist the updated context + trimmed message history."""
        try:
            with get_sync_database() as db:
                chat_session = db.query(ChatSession).filter(
                    ChatSession.user_id == user_id,
                    ChatSession.session_id == session_id,
                    ChatSession.is_active == True
                ).first()

                if chat_session:
                    chat_session.user_context = user_context

                    # Keep only recent messages to prevent memory bloat
                    recent_messages = messages[-20:]  # Keep last 20 messages
                    conversation_messages = [
                        {
                            "id": str(uuid4()),
                            "type": "user" if isinstance(msg, HumanMessage) else "assistant",
                            "content": msg.content,
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        for msg in recent_messages
                    ]

                    chat_session.conversation_data = {"messages": conversation_messages}
                    chat_session.last_message_at = datetime.utcnow()
                    chat_session.updated_at = datetime.utcnow()

                    db.commit()

        except Exception as e:
            logger.error(f"Error saving chat session: {e}")

    def _update_user_context(self, user_context: Dict[str, Any], last_user_message: str):
        """Update user context based on the latest user message."""
        message_lower = last_user_message.lower()

        # Detect workflow steps
        workflow_keywords = {
            "upload": ["upload", "file", "sdf", "pdb", "molecule"],
            "protein_prep": ["protein", "preparation", "pdbqt", "receptor"],
            "ligand_prep": ["ligand", "3d", "conformer", "tautomer"],
            "docking": ["dock", "bind", "affinity", "gnina", "vina"],
            "results": ["result", "analysis", "score", "visualization"]
        }

        for step, keywords in workflow_keywords.items():
            if any(keyword in message_lower for keyword in keywords):
                user_context["current_workflow_step"] = step
                if step not in user_context.get("topics_discussed", []):
                    user_context.setdefault("topics_discussed", []).append(step)

        # Detect user level
        advanced_terms = ["exhaustiveness", "rmsd", "binding mode", "conformer", "tautomer", "pharmacophore"]
        if any(term in message_lower for term in advanced_terms):
            if user_context.get("user_level") == "beginner":
                user_context["user_level"] = "intermediate"

    # Phrases that assert a run was actually started. Only used to catch a
    # model that claims success without having called the tool - see
    # _reconcile_claims.
    _START_CLAIM_PATTERNS = (
        r"\bhas been started\b", r"\bstarted successfully\b", r"\bhave started\b",
        r"\bi've started\b", r"\bis now running\b", r"\bjob started\b",
        r"\bkicked off\b", r"\bnow underway\b",
    )
    _START_DENIAL_PATTERNS = (
        r"\bnot been started\b", r"\bnot started\b", r"\bcouldn't start\b",
        r"\bcould not start\b", r"\bunable to start\b", r"\bcannot start\b",
        r"\bbefore i start\b", r"\bwould you like me to start\b", r"\bshall i start\b",
    )

    @staticmethod
    def _extract_actions(run_messages: List[BaseMessage], user_id: str) -> Dict[str, Any]:
        """Pull out what the agent *actually did* this turn, from tool results
        rather than from its prose, and confirm it against the database.

        The model can describe starting a job without having called the tool
        (seen live: it copied a success message from earlier in the same
        conversation). Anything the UI presents as fact has to come from here.
        """
        actions: Dict[str, Any] = {}

        for msg in run_messages:
            if getattr(msg, "type", None) != "tool":
                continue
            if getattr(msg, "name", None) != "start_docking_job":
                continue

            match = re.search(r"id=([0-9a-fA-F-]{36})", str(msg.content))
            if not match:
                continue  # tool ran but refused (e.g. missing receptor)

            job_id = match.group(1)
            # Confirm against the DB, and only for a job this user owns.
            try:
                with get_sync_database() as db:
                    job = db.execute(
                        select(ScreeningJob)
                        .join(Project, ScreeningJob.project_id == Project.id)
                        .where(ScreeningJob.id == uuid.UUID(job_id), Project.user_id == user_id)
                    ).scalar_one_or_none()
                    if job:
                        actions["started_job"] = {
                            "id": str(job.id),
                            "name": job.name,
                            "status": job.status,
                            "total_ligands": job.total_ligands,
                        }
            except Exception as e:
                logger.error(f"Could not verify started job {job_id}: {e}")

        return actions

    def _reconcile_claims(self, response_content: str, actions: Dict[str, Any]) -> str:
        """Append a correction if the reply claims a run was started but no
        job was actually created this turn.

        Without this the user is told a screening is underway when nothing is,
        and only finds out when the Running jobs panel stays empty.
        """
        if actions.get("started_job"):
            return response_content

        text = response_content.lower()
        if not any(re.search(p, text) for p in self._START_CLAIM_PATTERNS):
            return response_content
        if any(re.search(p, text) for p in self._START_DENIAL_PATTERNS):
            return response_content

        logger.warning("Agent claimed a job start with no matching tool call; correcting the reply")
        return (
            response_content
            + "\n\n---\n\n⚠️ **Correction: no run was actually started.** I have not "
            "created a job, so nothing is running. Please ask me again to start it, "
            "and check the Running jobs panel - a real run always appears there."
        )

    def _get_mock_response(self, user_message: str) -> str:
        """Generate mock responses when OpenAI is not configured."""
        user_message_lower = user_message.lower()

        if any(word in user_message_lower for word in ["hello", "hi", "start", "help"]):
            return """👋 Hello! I'm your Virtual Screening Assistant. I'm here to help you with molecular docking and drug discovery workflows.

I can guide you through:
• **Protein preparation** - Converting PDB files to docking-ready formats
• **Ligand preparation** - Generating 3D conformers and tautomers
• **Docking setup** - Configuring binding sites and parameters
• **Result analysis** - Interpreting binding affinities and poses

What specific area would you like help with? Are you just getting started, or do you have a particular question about your virtual screening project?

*Note: I'm currently running in demo mode. For full AI capabilities, please configure the OpenAI API key.*"""

        elif any(word in user_message_lower for word in ["protein", "pdb", "receptor"]):
            return """🧬 Great question about protein preparation! Here's a step-by-step guide:

**1. Structure Quality Check**
• Ensure your PDB file has complete residues
• Check for missing atoms or unusual structures
• Verify the binding site region is intact

**2. Protein Preparation Process**
• Remove water molecules (unless catalytically important)
• Add hydrogen atoms at physiological pH
• Optimize side chain conformations
• Convert to PDBQT format for docking

**3. In our application:**
• Go to the "Protein Preparation" tab
• Upload your PDB file
• The system will automatically prepare it for docking

Would you like more details about any of these steps, or do you have a specific protein you're working with?"""

        elif any(word in user_message_lower for word in ["ligand", "molecule", "sdf", "compound"]):
            return """💊 Excellent! Ligand preparation is crucial for successful virtual screening. Here's what you need to know:

**Ligand File Formats:**
• **SDF files** - Best for multiple compounds
• **SMILES** - For individual molecules
• **MOL2/PDB** - Also supported

**Preparation Steps:**
1. **3D Structure Generation** - Convert 2D to 3D coordinates
2. **Tautomer Enumeration** - Generate relevant chemical forms
3. **Conformer Generation** - Create multiple 3D conformations
4. **PDBQT Conversion** - Final format for docking

**Best Practices:**
• Clean your dataset (remove duplicates, check validity)
• Use appropriate protonation states for physiological pH
• Consider stereoisomers if relevant

In our platform, simply upload your SDF file and the system handles the preparation automatically!

What type of compounds are you working with?"""

        else:
            return f"""Thank you for your question about: "{user_message}"

I'd be happy to help with your virtual screening workflow! However, I'm currently running in demo mode with limited responses.

For comprehensive assistance with your specific question, please:

1. **Configure OpenAI API** - Add your API key to enable full AI capabilities
2. **Check our documentation** - For detailed guides and tutorials
3. **Contact support** - For technical assistance

Common topics I can help with:
• Protein and ligand preparation
• Docking parameter optimization
• Result interpretation
• Troubleshooting common issues
• Best practices and workflows

Is there a specific aspect of virtual screening you'd like to explore?"""

    async def process_message(self, user_id: str, session_id: str, message: str) -> Dict[str, Any]:
        """
        Process a user message and return AI response.
        """
        conversation_id = str(uuid4())

        try:
            user_context, history = self._load_context_and_history(user_id, session_id)
            new_user_message = HumanMessage(content=message)
            messages = history + [new_user_message]

            actions: Dict[str, Any] = {}

            if not self.llm:
                # Mock response when OpenAI is not configured
                response_content = self._get_mock_response(message)
            else:
                agent = self._build_agent(user_context, user_id, session_id)
                try:
                    result = await agent.ainvoke({"messages": messages})
                    run_messages = result["messages"]
                    final_message = run_messages[-1]
                    response_content = (
                        final_message.content if hasattr(final_message, "content") else str(final_message)
                    )
                    actions = self._extract_actions(run_messages, user_id)
                    response_content = self._reconcile_claims(response_content, actions)
                except Exception as e:
                    logger.error(f"Deep agent invocation failed: {e}")
                    response_content = "I apologize, but I'm experiencing technical difficulties. Please try again in a moment."

            self._update_user_context(user_context, message)
            messages = messages + [AIMessage(content=response_content)]
            self._save_context_and_history(user_id, session_id, user_context, messages)

            return {
                "response": response_content,
                "conversation_id": conversation_id,
                "session_id": session_id,
                "user_id": user_id,
                "actions": actions,
            }

        except Exception as e:
            logger.error(f"Error processing message: {e}")
            return {
                "response": "I apologize, but I encountered an error processing your message. Please try again.",
                "conversation_id": conversation_id,
                "session_id": session_id,
                "user_id": user_id,
                "actions": {},
            }

    async def get_session_history(self, user_id: str, session_id: str) -> List[Dict[str, Any]]:
        """Get conversation history for a user session."""
        try:
            with get_sync_database() as db:
                chat_session = db.query(ChatSession).filter(
                    ChatSession.user_id == user_id,
                    ChatSession.session_id == session_id,
                    ChatSession.is_active == True
                ).first()

                if chat_session and chat_session.conversation_data:
                    return chat_session.conversation_data.get("messages", [])

                return []

        except Exception as e:
            logger.error(f"Error getting session history: {e}")
            return []

    async def clear_session(self, user_id: str, session_id: str):
        """Clear a conversation session."""
        try:
            with get_sync_database() as db:
                chat_session = db.query(ChatSession).filter(
                    ChatSession.user_id == user_id,
                    ChatSession.session_id == session_id
                ).first()

                if chat_session:
                    chat_session.is_active = False
                    chat_session.conversation_data = {"messages": []}
                    db.commit()
                    logger.info(f"Cleared session {session_id} for user {user_id}")

        except Exception as e:
            logger.error(f"Error clearing session: {e}")

    async def get_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all active sessions for a user."""
        try:
            with get_sync_database() as db:
                chat_sessions = db.query(ChatSession).filter(
                    ChatSession.user_id == user_id,
                    ChatSession.is_active == True
                ).all()

                return [
                    {
                        "session_id": session.session_id,
                        "created_at": session.created_at.isoformat(),
                        "updated_at": session.updated_at.isoformat(),
                        "last_message_at": session.last_message_at.isoformat() if session.last_message_at else None,
                        "message_count": len(session.conversation_data.get("messages", []))
                    }
                    for session in chat_sessions
                ]

        except Exception as e:
            logger.error(f"Error getting user sessions: {e}")
            return []

    async def health_check(self) -> bool:
        """Check if the service is healthy."""
        try:
            if self.llm:
                # Ping the raw LLM directly rather than the full agent loop -
                # cheaper, and agent construction/tool wiring isn't what
                # this check is meant to catch.
                test_message = "Hello"
                response = self.llm.invoke([HumanMessage(content=test_message)])
                return bool(response.content)
            else:
                # If no LLM configured, service is still functional in demo mode
                return True
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
