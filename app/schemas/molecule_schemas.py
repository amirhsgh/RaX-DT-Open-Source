"""Schemas for molecule-related API operations."""

from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class LigandResponse(BaseModel):
    """Schema for ligand response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    job_id: UUID
    name: str
    original_index: int
    smiles: Optional[str]
    
    # Molecular properties
    molecular_weight: Optional[float]
    logp: Optional[float]
    hbd: Optional[int]
    hba: Optional[int]
    tpsa: Optional[float]
    rotatable_bonds: Optional[int]
    
    # Processing status
    status: str
    error_message: Optional[str]
    
    # Timestamps
    created_at: datetime
    prep_started_at: Optional[datetime]
    prep_completed_at: Optional[datetime]


class ProteinResponse(BaseModel):
    """Schema for protein response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    job_id: UUID
    name: str
    pdb_id: Optional[str]
    
    # File information
    file_size: Optional[int]
    
    # Processing status
    status: str
    error_message: Optional[str]
    
    # Protein properties
    chain_count: Optional[int]
    residue_count: Optional[int]
    atom_count: Optional[int]
    
    # Processing parameters
    preparation_pH: float
    
    # Timestamps
    created_at: datetime
    prep_started_at: Optional[datetime]
    prep_completed_at: Optional[datetime]


class DockingMode(BaseModel):
    """Schema for individual docking mode."""
    mode: int
    affinity: float
    rmsd_lb: Optional[float]
    rmsd_ub: Optional[float]


class DockingResultResponse(BaseModel):
    """Schema for docking result response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    job_id: UUID
    ligand_id: UUID
    
    # Docking scores and metrics
    binding_affinity: float
    mode: int
    rmsd_lb: Optional[float]
    rmsd_ub: Optional[float]
    
    # Processing info
    processing_time: Optional[float]
    vina_version: Optional[str]
    
    # Status
    status: str
    error_message: Optional[str]
    
    # Timestamps
    created_at: datetime
    docking_started_at: Optional[datetime]
    docking_completed_at: Optional[datetime]
    
    # Additional modes
    additional_modes: Optional[List[DockingMode]] = None


class DockingResultSummary(BaseModel):
    """Schema for docking result summary with ligand info."""
    ligand_id: UUID
    ligand_name: str
    binding_affinity: float
    mode: int
    rmsd_lb: Optional[float]
    rmsd_ub: Optional[float]
    processing_time: Optional[float]
    molecular_weight: Optional[float]
    logp: Optional[float]


class TopResults(BaseModel):
    """Schema for top docking results."""
    results: List[DockingResultSummary]
    total_count: int
    job_id: UUID
    job_name: str
    best_affinity: float
    worst_affinity: float
    average_affinity: float


class MolecularProperties(BaseModel):
    """Schema for calculated molecular properties."""
    molecular_weight: float
    logp: float
    hbd: int  # Hydrogen bond donors
    hba: int  # Hydrogen bond acceptors  
    tpsa: float  # Topological polar surface area
    rotatable_bonds: int
    aromatic_rings: int
    lipinski_violations: int
    qed_score: Optional[float] = None  # Quantitative Estimate of Drug-likeness


class LigandWithProperties(BaseModel):
    """Schema for ligand with calculated properties."""
    id: UUID
    name: str
    smiles: Optional[str]
    properties: MolecularProperties
    docking_result: Optional[DockingResultSummary] = None


class StructureVisualization(BaseModel):
    """Schema for 3D structure visualization data."""
    ligand_id: UUID
    ligand_name: str
    pdb_content: str
    pdbqt_content: Optional[str] = None
    docked_structure: Optional[str] = None  # Docked pose
    binding_affinity: Optional[float] = None