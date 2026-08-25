"""API endpoints for file upload operations."""

import os
import hashlib
import uuid
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.database import get_db, FileMetadata, ScreeningJob
from app.schemas.upload_schemas import (
    UploadResponse,
    FileValidationError,
    SupportedFormats,
    UploadLimits,
    BatchUploadResponse
)
from app.services.file_validator import FileValidator

router = APIRouter()


@router.get("/formats", response_model=SupportedFormats)
async def get_supported_formats():
    """Get information about supported file formats."""
    return SupportedFormats(
        ligand_formats=["sdf", "mol", "mol2", "smiles"],
        protein_formats=["pdbqt", "pdb"],  # Support both PDBQT and PDB
        ref_ligand_formats=["sdf", "mol", "mol2", "pdb", "pdbqt"],  # Reference ligand formats
        max_file_size=settings.MAX_UPLOAD_SIZE,
        max_molecules=settings.MAX_MOLECULES_PER_JOB
    )


@router.get("/limits", response_model=UploadLimits)
async def get_upload_limits():
    """Get upload limitations and constraints."""
    return UploadLimits()


@router.post("/ligands", response_model=UploadResponse)
async def upload_ligands(
    job_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload ligand file (SDF, MOL, MOL2, or SMILES)."""
    try:
        # Validate job exists
        result = await db.execute(
            select(ScreeningJob).where(ScreeningJob.id == uuid.UUID(job_id))
        )
        job = result.scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        # Validate file
        validator = FileValidator()
        validation_result = await validator.validate_ligand_file(file)
        
        if not validation_result.is_valid:
            return UploadResponse(
                success=False,
                message="File validation failed",
                errors=validation_result.errors
            )
        
        # Create upload directory
        upload_dir = Path(settings.UPLOAD_DIR) / job_id / "ligands"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix.lower()
        unique_filename = f"ligands_{uuid.uuid4().hex}{file_extension}"
        file_path = upload_dir / unique_filename
        
        # Save file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Calculate checksum
        checksum = hashlib.sha256(content).hexdigest()
        
        # Save file metadata
        file_metadata = FileMetadata(
            job_id=uuid.UUID(job_id),
            filename=unique_filename,
            original_filename=file.filename,
            file_path=str(file_path),
            file_type=file_extension[1:] if file_extension else "unknown",
            file_size=len(content),
            checksum=checksum,
            stage="upload",
            description="Uploaded ligand file"
        )
        
        db.add(file_metadata)
        
        # Update job with file path and store original filename
        job.ligand_file_path = str(file_path)
        job.total_ligands = validation_result.molecule_count

        # Store original filename in job config for later use
        if not job.config:
            job.config = {}
        job.config['original_ligand_filename'] = file.filename
        
        await db.commit()
        
        return UploadResponse(
            success=True,
            message="Ligand file uploaded successfully",
            file_id=file_metadata.id,
            filename=unique_filename,
            file_size=len(content),
            file_type=file_extension[1:],
            molecule_count=validation_result.molecule_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload ligand file: {str(e)}"
        )


@router.post("/protein", response_model=UploadResponse)
async def upload_protein(
    job_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload protein structure file (PDB or PDBQT)."""
    try:
        # Validate job exists
        result = await db.execute(
            select(ScreeningJob).where(ScreeningJob.id == uuid.UUID(job_id))
        )
        job = result.scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        # Validate file
        validator = FileValidator()
        validation_result = await validator.validate_protein_file(file)
        
        if not validation_result.is_valid:
            return UploadResponse(
                success=False,
                message="File validation failed",
                errors=validation_result.errors
            )
        
        # Create upload directory
        upload_dir = Path(settings.UPLOAD_DIR) / job_id / "protein"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix.lower()
        unique_filename = f"protein_{uuid.uuid4().hex}{file_extension}"
        file_path = upload_dir / unique_filename
        
        # Save file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Calculate checksum
        checksum = hashlib.sha256(content).hexdigest()
        
        # Save file metadata
        file_metadata = FileMetadata(
            job_id=uuid.UUID(job_id),
            filename=unique_filename,
            original_filename=file.filename,
            file_path=str(file_path),
            file_type=file_extension[1:] if file_extension else "unknown",
            file_size=len(content),
            checksum=checksum,
            stage="upload",
            description="Uploaded protein file"
        )
        
        db.add(file_metadata)
        
        # Update job with file path
        job.protein_file_path = str(file_path)
        
        await db.commit()
        
        return UploadResponse(
            success=True,
            message="Protein file uploaded successfully",
            file_id=file_metadata.id,
            filename=unique_filename,
            file_size=len(content),
            file_type=file_extension[1:]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload protein file: {str(e)}"
        )


@router.post("/ref-ligand", response_model=UploadResponse)
async def upload_ref_ligand(
    job_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload reference ligand file for GNINA autobox_ligand (SDF, MOL, MOL2, PDB, or PDBQT)."""
    try:
        # Validate job exists
        result = await db.execute(
            select(ScreeningJob).where(ScreeningJob.id == uuid.UUID(job_id))
        )
        job = result.scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        # Validate file
        validator = FileValidator()
        # Use ligand validation for now, we can create specific ref_ligand validation later
        validation_result = await validator.validate_ligand_file(file)
        
        if not validation_result.is_valid:
            return UploadResponse(
                success=False,
                message="File validation failed",
                errors=validation_result.errors
            )
        
        # Create upload directory
        upload_dir = Path(settings.UPLOAD_DIR) / job_id / "ref_ligand"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix.lower()
        unique_filename = f"ref_ligand_{uuid.uuid4().hex}{file_extension}"
        file_path = upload_dir / unique_filename
        
        # Save file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Calculate checksum
        checksum = hashlib.sha256(content).hexdigest()
        
        # Save file metadata
        file_metadata = FileMetadata(
            job_id=uuid.UUID(job_id),
            filename=unique_filename,
            original_filename=file.filename,
            file_path=str(file_path),
            file_type=file_extension[1:] if file_extension else "unknown",
            file_size=len(content),
            checksum=checksum,
            stage="upload",
            description="Uploaded reference ligand file for GNINA autobox_ligand"
        )
        
        db.add(file_metadata)
        
        # Update job with ref ligand file path
        job.ref_ligand_file_path = str(file_path)
        
        await db.commit()
        
        return UploadResponse(
            success=True,
            message="Reference ligand file uploaded successfully",
            file_id=file_metadata.id,
            filename=unique_filename,
            file_size=len(content),
            file_type=file_extension[1:],
            molecule_count=validation_result.molecule_count if hasattr(validation_result, 'molecule_count') else 1
        )
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload reference ligand file: {str(e)}"
        )


@router.get("/files/{job_id}")
async def list_job_files(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    """List all files associated with a job."""
    try:
        result = await db.execute(
            select(FileMetadata)
            .where(FileMetadata.job_id == uuid.UUID(job_id))
            .order_by(FileMetadata.created_at.desc())
        )
        files = result.scalars().all()
        
        return [
            {
                "id": str(file.id),
                "filename": file.filename,
                "original_filename": file.original_filename,
                "file_type": file.file_type,
                "file_size": file.file_size,
                "stage": file.stage,
                "created_at": file.created_at,
            }
            for file in files
        ]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list files: {str(e)}"
        )


@router.post("/batch-upload", response_model=BatchUploadResponse)
async def batch_upload_and_create_jobs(
    project_id: str = Form(...),
    ligands_files: List[UploadFile] = File(...),
    protein_file: UploadFile = File(...),
    ref_ligand_file: Optional[UploadFile] = File(None),
    job_name_prefix: str = Form("Batch Job"),
    ligands_per_job: int = Form(100),
    db: AsyncSession = Depends(get_db)
):
    """Batch upload ligands and automatically create jobs with specified ligands per job."""
    try:
        # Validate project exists
        from app.database import Project
        result = await db.execute(
            select(Project).where(Project.id == uuid.UUID(project_id))
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )

        # Create combined ligands file
        upload_dir = Path(settings.UPLOAD_DIR) / "batch_temp" / uuid.uuid4().hex
        upload_dir.mkdir(parents=True, exist_ok=True)

        combined_ligands_file = upload_dir / "combined_ligands.sdf"

        # Combine all ligand files into one WITHOUT modifying content
        total_ligands = 0
        validator = FileValidator()
        filename_to_ligand_count = {}  # Track ligand count per file for naming

        with open(combined_ligands_file, "w") as combined_file:
            for i, ligand_file in enumerate(ligands_files):
                # Validate each ligand file
                validation_result = await validator.validate_ligand_file(ligand_file)
                if not validation_result.is_valid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Ligand file {i+1} validation failed: {validation_result.errors}"
                    )

                # Read and append ligand content WITHOUT MODIFICATION
                ligand_content = await ligand_file.read()
                ligand_text = ligand_content.decode('utf-8')

                # Count molecules in this file
                file_mol_count = ligand_text.count('$$$$')
                total_ligands += file_mol_count
                filename_to_ligand_count[ligand_file.filename] = file_mol_count

                # Append to combined file AS-IS
                combined_file.write(ligand_text)
                if not ligand_text.endswith('\n'):
                    combined_file.write('\n')

                # Reset file pointer for potential future use
                await ligand_file.seek(0)

                logger.info(f"Added {file_mol_count} molecules from {ligand_file.filename}")

        # Calculate number of jobs needed
        num_jobs = (total_ligands + ligands_per_job - 1) // ligands_per_job

        logger.info(f"Creating {num_jobs} jobs for {total_ligands} ligands with {ligands_per_job} ligands per job")

        # Split ligands and create jobs
        created_jobs = []

        # Read all molecules from combined file for splitting
        from rdkit import Chem
        all_mols = list(Chem.SDMolSupplier(str(combined_ligands_file)))
        all_mols = [mol for mol in all_mols if mol is not None]  # Filter out None molecules

        for job_index in range(num_jobs):
            start_idx = job_index * ligands_per_job
            end_idx = min(start_idx + ligands_per_job, len(all_mols))
            job_molecules = all_mols[start_idx:end_idx]

            # Create job
            job_data = {
                "project_id": uuid.UUID(project_id),
                "name": f"{job_name_prefix} {job_index + 1}",
                "config": {
                    "description": f"Auto-created batch job {job_index + 1} with {len(job_molecules)} ligands",
                    "batch_info": {
                        "is_batch_job": True,
                        "batch_index": job_index + 1,
                        "total_batch_jobs": num_jobs,
                        "ligands_in_job": len(job_molecules)
                    },
                    "filename_info": filename_to_ligand_count
                },
                # Default processing parameters
                "pH": 7.4,
                "max_tautomers": 1,
                "max_stereoisomers": 1,
                "use_stable_tautomers": False,
                # Default docking parameters
                "center_x": 15.2,
                "center_y": 18.7,
                "center_z": 12.3,
                "size_x": 20.0,
                "size_y": 20.0,
                "size_z": 20.0,
                "exhaustiveness": 8,
                "num_modes": 9,
                "total_ligands": len(job_molecules)
            }

            job = ScreeningJob(**job_data)
            db.add(job)
            await db.commit()
            await db.refresh(job)

            # Create job-specific ligands file
            job_upload_dir = Path(settings.UPLOAD_DIR) / str(job.id) / "ligands"
            job_upload_dir.mkdir(parents=True, exist_ok=True)

            job_ligands_file = job_upload_dir / f"ligands_{uuid.uuid4().hex}.sdf"

            # Write molecules for this job WITHOUT MODIFYING MOLECULES
            writer = Chem.SDWriter(str(job_ligands_file))
            for mol in job_molecules:
                writer.write(mol)
            writer.close()

            # Update job with ligand file path
            job.ligand_file_path = str(job_ligands_file)

            # Upload protein file for this job
            protein_upload_dir = Path(settings.UPLOAD_DIR) / str(job.id) / "protein"
            protein_upload_dir.mkdir(parents=True, exist_ok=True)

            protein_content = await protein_file.read()
            await protein_file.seek(0)  # Reset for next job

            # Preserve original file extension for protein files
            protein_extension = Path(protein_file.filename).suffix.lower()
            protein_filename = f"protein_{uuid.uuid4().hex}{protein_extension}"
            protein_file_path = protein_upload_dir / protein_filename

            logger.info(f"Uploading protein file: {protein_file.filename} -> {protein_filename} (extension: {protein_extension})")

            with open(protein_file_path, "wb") as f:
                f.write(protein_content)

            job.protein_file_path = str(protein_file_path)

            # Upload reference ligand if provided
            if ref_ligand_file:
                ref_ligand_upload_dir = Path(settings.UPLOAD_DIR) / str(job.id) / "ref_ligand"
                ref_ligand_upload_dir.mkdir(parents=True, exist_ok=True)

                ref_ligand_content = await ref_ligand_file.read()
                await ref_ligand_file.seek(0)  # Reset for next job

                # Preserve original file extension for reference ligand files
                ref_ligand_extension = Path(ref_ligand_file.filename).suffix.lower()
                ref_ligand_filename = f"ref_ligand_{uuid.uuid4().hex}{ref_ligand_extension}"
                ref_ligand_file_path = ref_ligand_upload_dir / ref_ligand_filename

                with open(ref_ligand_file_path, "wb") as f:
                    f.write(ref_ligand_content)

                job.ref_ligand_file_path = str(ref_ligand_file_path)

            await db.commit()

            created_jobs.append({
                "id": str(job.id),
                "name": job.name,
                "ligand_count": len(job_molecules),
                "status": job.status
            })

        # Clean up temporary files
        import shutil
        shutil.rmtree(upload_dir)

        return BatchUploadResponse(
            success=True,
            message=f"Successfully created {num_jobs} jobs with {total_ligands} total ligands",
            jobs_created=created_jobs,
            total_ligands=total_ligands,
            total_jobs=num_jobs,
            ligands_per_job=ligands_per_job
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Batch upload failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch upload failed: {str(e)}"
        )


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete an uploaded file."""
    try:
        result = await db.execute(
            select(FileMetadata).where(FileMetadata.id == uuid.UUID(file_id))
        )
        file_metadata = result.scalar_one_or_none()

        if not file_metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found"
            )

        # Delete physical file
        if os.path.exists(file_metadata.file_path):
            os.remove(file_metadata.file_path)

        # Delete from database
        await db.delete(file_metadata)
        await db.commit()

        return {"message": "File deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete file: {str(e)}"
        )