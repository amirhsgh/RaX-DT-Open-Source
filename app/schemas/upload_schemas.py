"""Schemas for file upload operations."""

from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import BaseModel, Field


class FileValidationError(BaseModel):
    """Schema for file validation errors."""
    field: str
    message: str
    details: Optional[Dict[str, Any]] = None


class UploadResponse(BaseModel):
    """Schema for file upload response."""
    success: bool
    message: str
    file_id: Optional[UUID] = None
    filename: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    molecule_count: Optional[int] = None  # For SDF files
    errors: Optional[List[FileValidationError]] = None


class FileMetadataResponse(BaseModel):
    """Schema for file metadata response."""
    id: UUID
    filename: str
    original_filename: Optional[str]
    file_path: str
    file_type: str
    file_size: int
    checksum: str
    stage: Optional[str]
    description: Optional[str]
    is_temporary: bool
    expires_at: Optional[str] = None


class SupportedFormats(BaseModel):
    """Schema for supported file formats."""
    ligand_formats: List[str] = ["sdf", "mol", "mol2", "smiles"]
    protein_formats: List[str] = ["pdb", "pdbqt"]
    ref_ligand_formats: List[str] = ["sdf", "mol", "mol2", "pdb", "pdbqt"]
    max_file_size: int = Field(..., description="Maximum file size in bytes")
    max_molecules: int = Field(..., description="Maximum number of molecules")


class BatchJobInfo(BaseModel):
    """Schema for batch job information."""
    id: str
    name: str
    ligand_count: int
    status: str


class BatchUploadResponse(BaseModel):
    """Schema for batch upload response."""
    success: bool
    message: str
    jobs_created: List[BatchJobInfo]
    total_ligands: int
    total_jobs: int
    ligands_per_job: int
    errors: Optional[List[FileValidationError]] = None


class UploadLimits(BaseModel):
    """Schema for upload limitations."""
    max_file_size_mb: int = 100
    max_molecules_per_job: int = 10000
    supported_ligand_formats: List[str] = ["sdf", "mol", "mol2", "smiles", "smi"]
    supported_protein_formats: List[str] = ["pdb", "pdbqt"]
    supported_ref_ligand_formats: List[str] = ["sdf", "mol", "mol2", "pdb", "pdbqt"]
    concurrent_jobs_per_user: int = 5