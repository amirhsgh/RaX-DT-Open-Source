"""Schemas for job-related API operations."""

from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, field_serializer


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    user_id: Optional[str] = None


class ProjectResponse(BaseModel):
    """Schema for project response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    user_id: Optional[UUID]

    @field_serializer('id', 'user_id')
    def serialize_uuid(self, value: Optional[UUID], _info) -> Optional[str]:
        """Convert UUID to string for JSON serialization."""
        return str(value) if value is not None else None


class DockingParameters(BaseModel):
    """Schema for docking configuration parameters."""
    center_x: float = Field(..., description="X coordinate of binding site center")
    center_y: float = Field(..., description="Y coordinate of binding site center") 
    center_z: float = Field(..., description="Z coordinate of binding site center")
    size_x: float = Field(20.0, ge=5.0, le=50.0, description="Search space size in X direction")
    size_y: float = Field(20.0, ge=5.0, le=50.0, description="Search space size in Y direction")
    size_z: float = Field(20.0, ge=5.0, le=50.0, description="Search space size in Z direction")
    exhaustiveness: int = Field(8, ge=1, le=32, description="Thoroughness of search")
    num_modes: int = Field(9, ge=1, le=20, description="Number of binding modes")


class ProcessingParameters(BaseModel):
    """Schema for ligand processing parameters."""
    pH: float = Field(7.4, ge=0.0, le=14.0, description="pH for protonation states")
    max_tautomers: int = Field(1, ge=1, le=10, description="Maximum tautomers per molecule")
    max_stereoisomers: int = Field(8, ge=1, le=20, description="Maximum stereoisomers per molecule")
    use_stable_tautomers: bool = Field(True, description="Use stable tautomer selection")


class ScreeningJobCreate(BaseModel):
    """Schema for creating a new screening job."""
    name: str = Field(..., min_length=1, max_length=255)
    project_id: UUID
    
    # Processing parameters
    processing_params: ProcessingParameters
    docking_params: DockingParameters
    
    # Optional configuration
    config: Optional[Dict[str, Any]] = None


class ScreeningJobResponse(BaseModel):
    """Schema for screening job response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    project_id: UUID
    name: str
    status: str
    current_stage: str
    
    # Progress tracking
    total_ligands: int
    processed_ligands: int
    failed_ligands: int
    progress_percentage: float
    
    # Timestamps
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: datetime
    
    # Configuration
    config: Optional[Dict[str, Any]]
    error_message: Optional[str]
    
    # File paths
    ligand_file_path: Optional[str]
    protein_file_path: Optional[str]
    
    # Processing parameters  
    pH: float
    max_tautomers: int
    max_stereoisomers: int
    use_stable_tautomers: bool
    
    # Docking parameters
    center_x: Optional[float]
    center_y: Optional[float]
    center_z: Optional[float]
    size_x: float
    size_y: float
    size_z: float
    exhaustiveness: int
    num_modes: int


class JobStatusUpdate(BaseModel):
    """Schema for updating job status."""
    status: Optional[str] = None
    current_stage: Optional[str] = None
    progress_percentage: Optional[float] = Field(None, ge=0.0, le=100.0)
    processed_ligands: Optional[int] = None
    failed_ligands: Optional[int] = None
    error_message: Optional[str] = None


class JobProgressResponse(BaseModel):
    """Schema for job progress information."""
    id: UUID
    status: str
    current_stage: str
    progress_percentage: float
    processed_ligands: int
    failed_ligands: int
    total_ligands: int
    estimated_time_remaining: Optional[float] = None  # seconds
    processing_rate: Optional[float] = None  # ligands per second


class JobSummary(BaseModel):
    """Schema for job summary statistics."""
    id: UUID
    name: str
    status: str
    # Live progress, so a job list can show how far along a run is without
    # a follow-up /progress call per job.
    current_stage: Optional[str] = None
    progress_percentage: float = 0.0
    processed_ligands: int = 0
    total_ligands: int
    successful_dockings: int
    failed_dockings: int
    best_affinity: Optional[float]
    worst_affinity: Optional[float]
    average_affinity: Optional[float]
    processing_time: Optional[float]  # seconds
    created_at: datetime
    completed_at: Optional[datetime]


class BatchJobsResponse(BaseModel):
    """Schema for batch job operations response."""
    jobs: List[JobSummary]
    total_count: int
    page: int
    page_size: int
    total_pages: int