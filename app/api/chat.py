"""
Chatbot API endpoints with LangGraph integration for Virtual Screening assistance.
"""

import os
import logging
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.services.chatbot_service import ChatbotService
from app.services.file_validator import FileValidator
from app.services import agent_tools
from app.api.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize the chatbot service
chatbot_service = ChatbotService()


class ChatRequest(BaseModel):
    """Chat request model."""
    message: str
    session_id: Optional[str] = None  # Optional, will generate if not provided


class ChatResponse(BaseModel):
    """Chat response model."""
    response: str
    session_id: str
    conversation_id: str
    user_id: str
    timestamp: str
    # What the agent verifiably did this turn, read back from the database
    # rather than from its reply text - the UI presents these as fact, so
    # they must not come from the model's prose. See
    # ChatbotService._extract_actions.
    actions: Dict = {}


class ChatMessage(BaseModel):
    """Chat message model for history."""
    id: str
    type: str  # 'user' or 'assistant'
    content: str
    timestamp: str


class ChatHistory(BaseModel):
    """Chat history model."""
    session_id: str
    messages: List[ChatMessage]


@router.post("/chat", response_model=ChatResponse)
async def send_message(chat_request: ChatRequest, current_user: Dict = Depends(get_current_user)):
    """
    Send a message to the chatbot and get a response.

    The chatbot provides guidance on virtual screening processes,
    validates user approaches, and offers step-by-step help.
    """
    try:
        user_id = current_user["id"]
        session_id = chat_request.session_id or str(uuid4())  # Generate session ID if not provided

        logger.info(f"Received chat message from user {user_id}, session {session_id}")

        # Get response from chatbot service
        response = await chatbot_service.process_message(
            user_id=user_id,
            session_id=session_id,
            message=chat_request.message
        )

        return ChatResponse(
            response=response["response"],
            session_id=session_id,
            conversation_id=response.get("conversation_id", str(uuid4())),
            user_id=user_id,
            timestamp=datetime.utcnow().isoformat(),
            actions=response.get("actions") or {}
        )

    except Exception as e:
        logger.error(f"Error processing chat message: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process message: {str(e)}"
        )


@router.get("/chat/history/{session_id}", response_model=ChatHistory)
async def get_chat_history(session_id: str, current_user: Dict = Depends(get_current_user)):
    """
    Get chat history for a specific session.
    """
    try:
        user_id = current_user["id"]
        messages = await chatbot_service.get_session_history(user_id, session_id)

        return ChatHistory(
            session_id=session_id,
            messages=[
                ChatMessage(
                    id=msg["id"],
                    type=msg["type"],
                    content=msg["content"],
                    timestamp=msg["timestamp"]
                )
                for msg in messages
            ]
        )

    except Exception as e:
        logger.error(f"Error getting chat history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get chat history: {str(e)}"
        )


@router.delete("/chat/clear/{session_id}")
async def clear_chat_session(session_id: str, current_user: Dict = Depends(get_current_user)):
    """
    Clear a chat session and its history.
    """
    try:
        user_id = current_user["id"]
        await chatbot_service.clear_session(user_id, session_id)
        return {"message": f"Session {session_id} cleared successfully"}

    except Exception as e:
        logger.error(f"Error clearing chat session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear session: {str(e)}"
        )


@router.get("/chat/sessions")
async def get_user_sessions(current_user: Dict = Depends(get_current_user)):
    """
    Get list of active chat sessions for the current user.
    """
    try:
        user_id = current_user["id"]
        sessions = await chatbot_service.get_user_sessions(user_id)
        return {"sessions": sessions}

    except Exception as e:
        logger.error(f"Error getting user sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user sessions: {str(e)}"
        )


@router.post("/chat/upload")
async def upload_chat_file(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: Dict = Depends(get_current_user),
):
    """
    Attach a file to a chat session.

    The caller does not say what the file is - the kind (protein receptor /
    ligand set / reference ligand) is detected from its contents, so a
    clinician can just drop a file in without knowing which upload slot it
    belongs to.

    Everything is checked before it is stored: extension allowlist, size cap,
    and the same structural parse the regular upload endpoints use. These are
    text-based scientific formats, so "does it actually parse as a valid
    PDB/PDBQT/SDF" is the meaningful safety check - anything that isn't one
    of those never reaches disk. The stored filename is uuid-based, so a
    hostile filename can neither traverse directories nor overwrite anything.
    """
    user_id = current_user["id"]

    ext = Path(file.filename or "").suffix.lower()
    if ext not in agent_tools.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"'{ext or file.filename}' is not a supported file type. "
                f"Allowed: {', '.join(sorted(agent_tools.ALLOWED_EXTENSIONS))}"
            ),
        )

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File is too large (max {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB).",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty."
        )

    # Classify from the real bytes, not from what the caller claims it is.
    staging_base = agent_tools.chat_staging_dir(user_id, session_id)
    staging_base.mkdir(parents=True, exist_ok=True)
    probe_path = staging_base / f".probe_{uuid4().hex}{ext}"
    try:
        probe_path.write_bytes(content)
        kind = agent_tools.detect_file_kind(probe_path, file.filename)
    finally:
        probe_path.unlink(missing_ok=True)

    if kind == "unknown":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not recognise this file as a protein structure or a ligand set.",
        )

    # Structural validation - a file that does not parse as the format it
    # claims to be is rejected rather than stored.
    # Validate by FORMAT, not by detected kind: a reference ligand is a small
    # molecule that may arrive as .mol2/.sdf (ligand formats) or as .pdb
    # (structure format), so keying the validator off the kind would send a
    # .mol2 reference ligand into the protein validator and reject it.
    await file.seek(0)
    validator = FileValidator()
    if ext in agent_tools.LIGAND_EXTENSIONS:
        result = await validator.validate_ligand_file(file)
    else:
        result = await validator.validate_protein_file(file)

    if not result.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File failed validation: {'; '.join(str(e) for e in result.errors)}",
        )

    stored = agent_tools.store_staged_file(user_id, session_id, kind, content, file.filename)
    logger.info("Chat upload: user=%s session=%s kind=%s file=%s", user_id, session_id, kind, file.filename)

    labels = {
        "protein": "protein receptor",
        "ligand": "ligand set",
        "ref_ligand": "reference ligand (binding-site marker)",
    }
    return {
        "filename": file.filename,
        "detected_kind": kind,
        "detected_label": labels[kind],
        "size": len(content),
        "molecule_count": getattr(result, "molecule_count", None),
        "stored_as": stored.name,
    }


@router.get("/chat/files/{session_id}")
async def list_chat_files(session_id: str, current_user: Dict = Depends(get_current_user)):
    """What has been attached to this chat session so far, by kind."""
    user_id = current_user["id"]
    out = {}
    for kind in agent_tools.FILE_KINDS:
        d = agent_tools.chat_staging_dir(user_id, session_id, kind)
        out[kind] = [p.name.split("__", 1)[-1] for p in sorted(d.glob("*"))] if d.is_dir() else []
    return out


@router.get("/chat/health")
async def chat_health_check():
    """
    Health check for chat service.
    """
    try:
        # Check if OpenAI API key is configured
        openai_configured = bool(os.getenv("OPENAI_API_KEY"))

        # Check if chatbot service is healthy
        service_healthy = await chatbot_service.health_check()

        return {
            "status": "healthy" if (openai_configured and service_healthy) else "degraded",
            "openai_configured": openai_configured,
            "service_healthy": service_healthy,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Chat health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }