"""
Database models for the virtual screening application.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
import hashlib

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    LargeBinary,
    JSON,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid

Base = declarative_base()


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"


class User(Base):
    """User model for authentication and authorization."""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))

    # User status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    role = Column(String(20), default=UserRole.USER)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = Column(DateTime)

    # User preferences
    preferences = Column(JSON, default={})

    # Relationships
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")

    def set_password(self, password: str):
        """Hash and set the password."""
        self.password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), b'salt', 100000).hex()

    def check_password(self, password: str) -> bool:
        """Check if the provided password matches the stored hash."""
        return self.password_hash == hashlib.pbkdf2_hmac('sha256', password.encode(), b'salt', 100000).hex()


class UserSession(Base):
    """User session management."""
    __tablename__ = "user_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_token = Column(String(255), unique=True, nullable=False, index=True)

    # Session info
    ip_address = Column(String(45))  # IPv6 compatible
    user_agent = Column(Text)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    last_accessed_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    # Status
    is_active = Column(Boolean, default=True)

    # Relationships
    user = relationship("User", back_populates="sessions")


class ChatSession(Base):
    """Chat session for per-user chatbot memory."""
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_id = Column(String(255), nullable=False, index=True)  # External session ID

    # Session data
    conversation_data = Column(JSON, default={})  # Store conversation history and context
    user_context = Column(JSON, default={})  # User preferences and context

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_message_at = Column(DateTime)

    # Status
    is_active = Column(Boolean, default=True)

    # Relationships
    user = relationship("User", back_populates="chat_sessions")


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running" 
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProcessingStage(str, Enum):
    UPLOAD = "upload"
    LIGAND_PREP_3D = "ligand_prep_3d"
    PROTEIN_PREP = "protein_prep"
    LIGAND_PREP_ADVANCED = "ligand_prep_advanced"
    DOCKING = "docking"
    RESULTS = "results"


class Project(Base):
    """Project model to group related screening jobs."""
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="projects")
    jobs = relationship("ScreeningJob", back_populates="project", cascade="all, delete-orphan")


class ScreeningJob(Base):
    """Main screening job that encompasses the entire pipeline."""
    __tablename__ = "screening_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(String(20), default=JobStatus.PENDING)
    current_stage = Column(String(30), default=ProcessingStage.UPLOAD)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Progress tracking
    total_ligands = Column(Integer, default=0)
    processed_ligands = Column(Integer, default=0)
    failed_ligands = Column(Integer, default=0)
    progress_percentage = Column(Float, default=0.0)
    
    # Configuration
    config = Column(JSON)  # Store job configuration as JSON
    error_message = Column(Text)
    celery_task_id = Column(String(255))  # Celery task ID for tracking background job
    
    # File paths
    ligand_file_path = Column(String(500))
    protein_file_path = Column(String(500))
    ref_ligand_file_path = Column(String(500))  # Reference ligand for GNINA autobox_ligand
    
    # Processing parameters
    pH = Column(Float, default=7.4)
    max_tautomers = Column(Integer, default=1)
    max_stereoisomers = Column(Integer, default=8)
    use_stable_tautomers = Column(Boolean, default=True)
    
    # Docking parameters
    center_x = Column(Float)
    center_y = Column(Float)
    center_z = Column(Float)
    size_x = Column(Float, default=20.0)
    size_y = Column(Float, default=20.0)
    size_z = Column(Float, default=20.0)
    exhaustiveness = Column(Integer, default=8)
    num_modes = Column(Integer, default=9)
    
    # Relationships
    project = relationship("Project", back_populates="jobs")
    ligands = relationship("Ligand", back_populates="job", cascade="all, delete-orphan")
    protein = relationship("Protein", back_populates="job", uselist=False, cascade="all, delete-orphan")
    docking_results = relationship("DockingResult", back_populates="job", cascade="all, delete-orphan")
    file_metadata = relationship("FileMetadata", back_populates="job", cascade="all, delete-orphan")
    processing_logs = relationship("ProcessingLog", back_populates="job", cascade="all, delete-orphan")


class Ligand(Base):
    """Individual ligand molecule."""
    __tablename__ = "ligands"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("screening_jobs.id"), nullable=False)
    
    # Identification
    name = Column(String(255), nullable=False, index=True)
    original_index = Column(Integer, nullable=False)
    smiles = Column(Text)
    
    # Molecular properties
    molecular_weight = Column(Float)
    logp = Column(Float)
    hbd = Column(Integer)  # Hydrogen bond donors
    hba = Column(Integer)  # Hydrogen bond acceptors
    tpsa = Column(Float)   # Topological polar surface area
    rotatable_bonds = Column(Integer)
    
    # Processing status
    status = Column(String(20), default=JobStatus.PENDING)
    error_message = Column(Text)
    
    # File paths for different stages
    original_structure_path = Column(String(500))  # Original 2D structure
    initial_3d_path = Column(String(500))          # After initial 3D generation
    prepared_structure_path = Column(String(500))   # After full preparation
    pdbqt_path = Column(String(500))               # PDBQT format for docking
    
    # Processing timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    prep_started_at = Column(DateTime)
    prep_completed_at = Column(DateTime)
    
    # Relationships
    job = relationship("ScreeningJob", back_populates="ligands")
    docking_results = relationship("DockingResult", back_populates="ligand", cascade="all, delete-orphan")


class Protein(Base):
    """Target protein structure."""
    __tablename__ = "proteins"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("screening_jobs.id"), nullable=False)
    
    # Identification
    name = Column(String(255), nullable=False)
    pdb_id = Column(String(10), index=True)  # PDB ID if available
    
    # File information
    original_file_path = Column(String(500))
    prepared_pdbqt_path = Column(String(500))
    file_size = Column(Integer)
    
    # Processing status
    status = Column(String(20), default=JobStatus.PENDING)
    error_message = Column(Text)
    
    # Protein properties
    chain_count = Column(Integer)
    residue_count = Column(Integer)
    atom_count = Column(Integer)
    
    # Processing parameters
    preparation_pH = Column(Float, default=7.4)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    prep_started_at = Column(DateTime)
    prep_completed_at = Column(DateTime)
    
    # Relationships
    job = relationship("ScreeningJob", back_populates="protein")


class DockingResult(Base):
    """Individual docking result for a ligand-protein pair."""
    __tablename__ = "docking_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("screening_jobs.id"), nullable=False)
    ligand_id = Column(UUID(as_uuid=True), ForeignKey("ligands.id"), nullable=False)
    
    # Docking scores and metrics
    binding_affinity = Column(Float, nullable=True, index=True)  # kcal/mol, null for failed docking
    mode = Column(Integer, default=1)  # Best binding mode (1-9)
    rmsd_lb = Column(Float)  # RMSD lower bound
    rmsd_ub = Column(Float)  # RMSD upper bound
    
    # Processing info
    processing_time = Column(Float)  # seconds
    vina_version = Column(String(50))
    
    # File paths
    output_pdbqt_path = Column(String(500))  # Docked structure
    log_file_path = Column(String(500))      # Vina log
    
    # Status and errors
    status = Column(String(20), default=JobStatus.PENDING)
    error_message = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    docking_started_at = Column(DateTime)
    docking_completed_at = Column(DateTime)
    
    # Additional metadata
    additional_modes = Column(JSON)  # Store all binding modes as JSON
    
    # Relationships
    job = relationship("ScreeningJob", back_populates="docking_results")
    ligand = relationship("Ligand", back_populates="docking_results")


class ProcessingLog(Base):
    """Log entries for tracking processing steps."""
    __tablename__ = "processing_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime, primary_key=True, default=datetime.utcnow)
    job_id = Column(UUID(as_uuid=True), ForeignKey("screening_jobs.id"), nullable=False)
    ligand_id = Column(UUID(as_uuid=True), ForeignKey("ligands.id"), nullable=True)
    
    # Log details
    stage = Column(String(30), nullable=False)
    level = Column(String(10), default="INFO")  # DEBUG, INFO, WARNING, ERROR
    message = Column(Text, nullable=False)
    
    # Additional context
    details = Column(JSON)  # Store additional structured data

    # Relationships
    job = relationship("ScreeningJob", back_populates="processing_logs")

    # Index for efficient queries
    __table_args__ = (
        {"postgresql_partition_by": "RANGE (created_at)"},
    )


class FileMetadata(Base):
    """Metadata for uploaded and generated files."""
    __tablename__ = "file_metadata"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("screening_jobs.id"), nullable=False)
    
    # File information
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255))
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50))  # sdf, pdb, pdbqt, csv, etc.
    file_size = Column(Integer)
    checksum = Column(String(64))  # SHA-256
    
    # File purpose/stage
    stage = Column(String(30))
    description = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    accessed_at = Column(DateTime)
    
    # Status
    is_temporary = Column(Boolean, default=False)
    expires_at = Column(DateTime)

    # Relationships
    job = relationship("ScreeningJob", back_populates="file_metadata")


class BenchmarkStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BenchmarkRun(Base):
    """A benchmark run against DUD-E / LIT-PCBA style targets (AUROC/EF/BEDROC validation)."""
    __tablename__ = "benchmark_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    status = Column(String(20), default=BenchmarkStatus.PENDING)

    # Run configuration: targets, max_actives_per_target, max_decoys_per_target,
    # rank_by ("affinity" | "cnn_score" | "both"), docking param overrides
    config = Column(JSON, nullable=False)

    celery_task_id = Column(String(255))

    total_targets = Column(Integer, default=0)
    completed_targets = Column(Integer, default=0)
    failed_targets = Column(Integer, default=0)

    error_message = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    # Updated on every target completion while running. Lets the UI/resume logic
    # tell a genuinely active run apart from one whose worker died mid-run without
    # updating status (still shows "running" in the DB with a stale heartbeat).
    last_heartbeat = Column(DateTime)

    # Relationships
    target_results = relationship(
        "BenchmarkTargetResult", back_populates="run", cascade="all, delete-orphan"
    )


class BenchmarkTargetResult(Base):
    """Per-target enrichment metrics for a single benchmark run."""
    __tablename__ = "benchmark_target_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("benchmark_runs.id"), nullable=False)

    target_name = Column(String(100), nullable=False, index=True)
    dataset_source = Column(String(20))  # "dude" | "lit-pcba"

    status = Column(String(20), default=BenchmarkStatus.PENDING)
    error_message = Column(Text)

    n_actives = Column(Integer, default=0)
    n_decoys = Column(Integer, default=0)
    n_failed = Column(Integer, default=0)

    # {"affinity": {"auroc":.., "ef1":.., "ef5":.., "ef10":.., "bedroc":..},
    #  "cnn_score": {...}}
    metrics = Column(JSON)

    avg_processing_time_sec = Column(Float)
    total_wallclock_sec = Column(Float)

    # Path to a JSON file with per-compound {name, label, affinity, cnn_score}
    raw_scores_path = Column(String(500))

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    # Relationships
    run = relationship("BenchmarkRun", back_populates="target_results")


class RedockingStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RedockingRun(Base):
    """
    Pose-accuracy validation: re-dock a protein's own co-crystallized ligand
    (starting from a freshly-generated conformer, not the crystal coordinates)
    and measure RMSD to the crystal pose. A different question from
    BenchmarkRun's enrichment metrics (can the pipeline find a known binder
    among decoys) - this asks whether it can find the *right pose* at all.
    Kept as its own table pair rather than folded into BenchmarkRun/
    BenchmarkTargetResult since the data shape (single ligand, RMSD, no
    actives/decoys) doesn't fit that schema.
    """
    __tablename__ = "redocking_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    status = Column(String(20), default=RedockingStatus.PENDING)

    # {"pdb_ids": [...], "rmsd_threshold": 2.0, "docking_params": {...}}
    config = Column(JSON, nullable=False)

    celery_task_id = Column(String(255))

    total_targets = Column(Integer, default=0)
    completed_targets = Column(Integer, default=0)
    failed_targets = Column(Integer, default=0)

    error_message = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    last_heartbeat = Column(DateTime)

    target_results = relationship(
        "RedockingTargetResult", back_populates="run", cascade="all, delete-orphan"
    )


class RedockingTargetResult(Base):
    """Redocking result for a single PDB entry within a RedockingRun."""
    __tablename__ = "redocking_target_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("redocking_runs.id"), nullable=False)

    # Either a bare PDB id (RCSB source, e.g. "4HT2") or "<target>:<pdbid>"
    # for local-dataset-source entries (e.g. "ESR1_ago:3p0g") - widened past
    # a plain 4-char PDB id to fit those.
    pdb_id = Column(String(30), nullable=False, index=True)
    ligand_resname = Column(String(10))

    status = Column(String(20), default=RedockingStatus.PENDING)
    error_message = Column(Text)

    # SR0 (top-ranked pose) and SR5 (best of the 5 most-favorable poses) -
    # same success-rate definitions SwissDock's own validation reports
    # (Grosdidier et al. 2011, NAR), so results are directly comparable.
    rmsd = Column(Float)  # SR0: RMSD of the single top-ranked pose
    success = Column(Boolean)  # rmsd <= config.rmsd_threshold (default 2.0 A)
    rmsd_sr5 = Column(Float)  # SR5: best RMSD among the top-5 ranked poses
    success_sr5 = Column(Boolean)
    best_affinity = Column(Float)
    cnn_affinity = Column(Float)
    processing_time_sec = Column(Float)

    docked_pose_path = Column(String(500))
    crystal_ligand_path = Column(String(500))

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    run = relationship("RedockingRun", back_populates="target_results")


class SystemMetrics(Base):
    """System performance and usage metrics."""
    __tablename__ = "system_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recorded_at = Column(DateTime, primary_key=True, default=datetime.utcnow)
    
    # System metrics
    cpu_usage = Column(Float)
    memory_usage = Column(Float)
    disk_usage = Column(Float)
    active_jobs = Column(Integer)
    queue_size = Column(Integer)
    
    # Processing metrics
    ligands_processed_hour = Column(Integer)
    average_processing_time = Column(Float)
    success_rate = Column(Float)
    
    # Indexes for time-series queries
    __table_args__ = (
        {"postgresql_partition_by": "RANGE (recorded_at)"},
    )