"""API endpoints for molecule and docking result operations."""

import os
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db, Ligand, DockingResult, ScreeningJob
from app.schemas.molecule_schemas import (
    LigandResponse,
    DockingResultResponse,
    DockingResultSummary,
    TopResults
)
from app.services.csv_exporter import CSVExporter

router = APIRouter()


@router.get("/ligands/{job_id}", response_model=List[LigandResponse])
async def get_job_ligands(
    job_id: UUID,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get all ligands for a specific job."""
    try:
        result = await db.execute(
            select(Ligand)
            .where(Ligand.job_id == job_id)
            .offset(skip)
            .limit(limit)
            .order_by(Ligand.original_index)
        )
        ligands = result.scalars().all()
        
        return ligands
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get ligands: {str(e)}"
        )


@router.get("/ligands/detail/{ligand_id}", response_model=LigandResponse)
async def get_ligand_detail(
    ligand_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get detailed information about a specific ligand."""
    try:
        result = await db.execute(select(Ligand).where(Ligand.id == ligand_id))
        ligand = result.scalar_one_or_none()
        
        if not ligand:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ligand not found"
            )
        
        return ligand
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get ligand: {str(e)}"
        )


@router.get("/results/{job_id}", response_model=List[DockingResultResponse])
async def get_job_results(
    job_id: UUID,
    skip: int = 0,
    limit: int = 100,
    min_affinity: Optional[float] = None,
    max_affinity: Optional[float] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get docking results for a specific job with optional filtering."""
    try:
        query = select(DockingResult).where(DockingResult.job_id == job_id)
        
        if min_affinity is not None:
            query = query.where(DockingResult.binding_affinity >= min_affinity)
        
        if max_affinity is not None:
            query = query.where(DockingResult.binding_affinity <= max_affinity)
        
        query = query.offset(skip).limit(limit).order_by(DockingResult.binding_affinity)
        
        result = await db.execute(query)
        results = result.scalars().all()
        
        return results
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get docking results: {str(e)}"
        )


@router.get("/results/top/{job_id}", response_model=TopResults)
async def get_top_results(
    job_id: UUID,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """Get top docking results for a job."""
    try:
        # Verify job exists
        job_result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        # Get top results with ligand information
        query = select(
            DockingResult.ligand_id,
            DockingResult.binding_affinity,
            DockingResult.mode,
            DockingResult.rmsd_lb,
            DockingResult.rmsd_ub,
            DockingResult.processing_time,
            Ligand.name.label('ligand_name'),
            Ligand.molecular_weight,
            Ligand.logp
        ).select_from(
            DockingResult.__table__.join(Ligand.__table__)
        ).where(
            DockingResult.job_id == job_id
        ).order_by(
            DockingResult.binding_affinity
        ).limit(limit)
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        # Get statistics
        stats_result = await db.execute(
            select(
                func.count(DockingResult.id).label('total'),
                func.min(DockingResult.binding_affinity).label('best'),
                func.max(DockingResult.binding_affinity).label('worst'),
                func.avg(DockingResult.binding_affinity).label('average')
            ).where(DockingResult.job_id == job_id)
        )
        stats = stats_result.first()
        
        # Convert to response format
        results = []
        for row in rows:
            results.append(DockingResultSummary(
                ligand_id=row.ligand_id,
                ligand_name=row.ligand_name,
                binding_affinity=row.binding_affinity,
                mode=row.mode,
                rmsd_lb=row.rmsd_lb,
                rmsd_ub=row.rmsd_ub,
                processing_time=row.processing_time,
                molecular_weight=row.molecular_weight,
                logp=row.logp
            ))
        
        return TopResults(
            results=results,
            total_count=stats.total if stats.total else 0,
            job_id=job_id,
            job_name=job.name,
            best_affinity=stats.best if stats.best else 0.0,
            worst_affinity=stats.worst if stats.worst else 0.0,
            average_affinity=stats.average if stats.average else 0.0
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get top results: {str(e)}"
        )


@router.get("/results/detail/{result_id}", response_model=DockingResultResponse)
async def get_result_detail(
    result_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get detailed information about a specific docking result."""
    try:
        result = await db.execute(
            select(DockingResult).where(DockingResult.id == result_id)
        )
        docking_result = result.scalar_one_or_none()
        
        if not docking_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Docking result not found"
            )
        
        return docking_result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get docking result: {str(e)}"
        )


@router.get("/export/csv/{job_id}")
async def export_results_csv(
    job_id: UUID,
    include_failed: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Export docking results as CSV file."""
    try:
        # Verify job exists
        job_result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        # Export results
        exporter = CSVExporter()
        csv_content = await exporter.export_job_results(
            str(job_id), 
            include_failed=include_failed,
            db=db
        )
        
        # Create filename
        filename = f"docking_results_{job.name.replace(' ', '_')}_{str(job_id)[:8]}.csv"
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export results: {str(e)}"
        )


@router.get("/stats/{job_id}")
async def get_job_statistics(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive statistics for a job."""
    try:
        # Verify job exists
        job_result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        # Get docking statistics
        stats_result = await db.execute(
            select(
                func.count(DockingResult.id).label('total_results'),
                func.min(DockingResult.binding_affinity).label('best_affinity'),
                func.max(DockingResult.binding_affinity).label('worst_affinity'),
                func.avg(DockingResult.binding_affinity).label('average_affinity'),
                func.stddev(DockingResult.binding_affinity).label('stddev_affinity'),
                func.avg(DockingResult.processing_time).label('average_processing_time'),
                func.sum(DockingResult.processing_time).label('total_processing_time')
            ).where(DockingResult.job_id == job_id)
        )
        stats = stats_result.first()
        
        # Get ligand statistics
        ligand_stats_result = await db.execute(
            select(
                func.count(Ligand.id).label('total_ligands'),
                func.avg(Ligand.molecular_weight).label('avg_molecular_weight'),
                func.avg(Ligand.logp).label('avg_logp'),
                func.avg(Ligand.hbd).label('avg_hbd'),
                func.avg(Ligand.hba).label('avg_hba')
            ).where(Ligand.job_id == job_id)
        )
        ligand_stats = ligand_stats_result.first()
        
        # Affinity distribution (binning)
        bin_expression = func.floor(DockingResult.binding_affinity / 2) * 2
        distribution_result = await db.execute(
            select(
                func.count(DockingResult.id).label('count'),
                bin_expression.label('bin')
            ).where(DockingResult.job_id == job_id)
            .group_by(bin_expression)
            .order_by('bin')
        )
        distribution = [{"bin": row.bin, "count": row.count} for row in distribution_result.fetchall()]
        
        return {
            "job_id": str(job_id),
            "job_name": job.name,
            "docking_statistics": {
                "total_results": stats.total_results or 0,
                "best_affinity": stats.best_affinity,
                "worst_affinity": stats.worst_affinity,
                "average_affinity": stats.average_affinity,
                "stddev_affinity": stats.stddev_affinity,
                "average_processing_time": stats.average_processing_time,
                "total_processing_time": stats.total_processing_time
            },
            "ligand_statistics": {
                "total_ligands": ligand_stats.total_ligands or 0,
                "average_molecular_weight": ligand_stats.avg_molecular_weight,
                "average_logp": ligand_stats.avg_logp,
                "average_hbd": ligand_stats.avg_hbd,
                "average_hba": ligand_stats.avg_hba
            },
            "affinity_distribution": distribution,
            "success_rate": (stats.total_results / ligand_stats.total_ligands * 100) if ligand_stats.total_ligands else 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get statistics: {str(e)}"
        )


@router.get("/ligands/{ligand_id}/structure")
async def get_ligand_structure(ligand_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get ligand structure data for visualization."""
    import os
    try:
        result = await db.execute(select(Ligand).where(Ligand.id == ligand_id))
        ligand = result.scalar_one_or_none()
        
        if not ligand:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ligand not found"
            )
        
        # Try to read structure files in priority order
        structure_content = None
        file_format = None
        
        # 1. PDBQT (prepared for docking)
        if ligand.pdbqt_path and os.path.exists(ligand.pdbqt_path):
            with open(ligand.pdbqt_path, 'r') as f:
                structure_content = f.read()
            file_format = "pdbqt"
        # 2. Prepared structure
        elif ligand.prepared_structure_path and os.path.exists(ligand.prepared_structure_path):
            with open(ligand.prepared_structure_path, 'r') as f:
                structure_content = f.read()
            file_format = "sdf"
        # 3. 3D structure
        elif ligand.initial_3d_path and os.path.exists(ligand.initial_3d_path):
            with open(ligand.initial_3d_path, 'r') as f:
                structure_content = f.read()
            file_format = "sdf"
        # 4. Original structure
        elif ligand.original_structure_path and os.path.exists(ligand.original_structure_path):
            with open(ligand.original_structure_path, 'r') as f:
                structure_content = f.read()
            file_format = "sdf"
        
        if not structure_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No structure file found for ligand"
            )
        
        # Get docking result if available
        docking_result = await db.execute(
            select(DockingResult).where(DockingResult.ligand_id == ligand_id)
            .order_by(DockingResult.binding_affinity)
            .limit(1)
        )
        docking_data = docking_result.scalar_one_or_none()
        
        return {
            "ligand_name": ligand.name,
            "ligand_id": str(ligand.id),
            "structure_content": structure_content,
            "file_format": file_format,
            "sdf_content": structure_content if file_format == "sdf" else None,
            "pdbqt_content": structure_content if file_format == "pdbqt" else None,
            "binding_affinity": docking_data.binding_affinity if docking_data else None,
            "molecular_properties": {
                "molecular_weight": ligand.molecular_weight,
                "logp": ligand.logp,
                "hbd": ligand.hbd,
                "hba": ligand.hba,
                "tpsa": ligand.tpsa,
                "rotatable_bonds": ligand.rotatable_bonds
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get ligand structure: {str(e)}"
        )


@router.get("/download/{ligand_id}")
async def download_ligand_docking_output(
    ligand_id: UUID,
    format: str = "pdbqt",  # pdbqt, pdb, sdf, log, or zip
    db: AsyncSession = Depends(get_db)
):
    """Download docking output files for a specific ligand."""
    try:
        from app.core.config import settings

        # Get ligand information and its docking result
        ligand_result = await db.execute(
            select(Ligand, DockingResult)
            .join(DockingResult, Ligand.id == DockingResult.ligand_id, isouter=True)
            .where(Ligand.id == ligand_id)
        )
        result_row = ligand_result.first()

        if not result_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ligand not found"
            )

        ligand, docking_result = result_row

        # Clean ligand name for filename (same logic as docking service)
        ligand_name = ligand.name or f"ligand_{str(ligand_id)[:8]}"
        clean_name = ligand_name.replace(' ', '_').replace('/', '_').replace('\\', '_').replace('<', '').replace('>', '')

        # Try different paths where the output file might be located
        possible_paths = []

        # Path 1: Use output_pdbqt_path from database if available
        if docking_result and docking_result.output_pdbqt_path:
            possible_paths.append(docking_result.output_pdbqt_path)

        # Path 2: Using exact clean drug name as used in docking service
        possible_paths.append(os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_name}.pdbqt"))

        # Path 3: Handle parentheses in different ways (common issue)
        if '(' in ligand_name and ')' in ligand_name:
            # Try with parentheses replaced with underscores
            alt_name = ligand_name.replace('(', '_').replace(')', '_').replace(' ', '_')
            possible_paths.append(os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{alt_name}.pdbqt"))

        # Path 4: Using ligand UUID
        possible_paths.append(os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}_out.pdbqt"))

        # Path 5: Using mol_X format (from original indexing)
        possible_paths.append(os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"mol_{ligand.original_index}_out.pdbqt"))

        # Path 6: Direct PDBQT file without _out suffix
        possible_paths.append(os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}.pdbqt"))
        possible_paths.append(os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"mol_{ligand.original_index}.pdbqt"))
        
        # Find the actual file
        found_file = None
        for path in possible_paths:
            if path and os.path.exists(path):
                found_file = path
                break
        
        if not found_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Docking output file not found. Tried: {possible_paths}"
            )
        
        # Handle different output formats
        if format.lower() == "log":
            # Look for log file
            log_paths = [
                os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}_log.txt"),
                os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"mol_{ligand.original_index}_log.txt"),
                os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_name}_log.txt")
            ]
            
            log_file = None
            for log_path in log_paths:
                if os.path.exists(log_path):
                    log_file = log_path
                    break
            
            if not log_file:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Log file not found"
                )
            
            filename = f"{clean_name}_docking_log.txt"
            return FileResponse(
                path=log_file,
                media_type="text/plain",
                filename=filename
            )
        
        elif format.lower() == "pdb":
            # Convert PDBQT to PDB format
            with open(found_file, 'r') as f:
                pdbqt_content = f.read()
            
            # Simple conversion: remove PDBQT-specific lines
            pdb_lines = []
            for line in pdbqt_content.split('\n'):
                if not (line.startswith('ROOT') or line.startswith('ENDROOT') or 
                       line.startswith('BRANCH') or line.startswith('ENDBRANCH') or 
                       line.startswith('TORSDOF')):
                    pdb_lines.append(line)
            
            pdb_content = '\n'.join(pdb_lines)
            filename = f"{clean_name}_docked.pdb"
            
            return Response(
                content=pdb_content,
                media_type="chemical/x-pdb",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        
        elif format.lower() == "sdf":
            # Convert to SDF if possible (basic implementation)
            try:
                # This would require more sophisticated conversion
                # For now, just return the PDBQT file with SDF extension
                filename = f"{clean_name}_docked.sdf"
                return FileResponse(
                    path=found_file,
                    media_type="chemical/x-mdl-sdfile",
                    filename=filename
                )
            except:
                raise HTTPException(
                    status_code=status.HTTP_501_NOT_IMPLEMENTED,
                    detail="SDF conversion not yet implemented"
                )
        
        elif format.lower() == "zip":
            # Create ZIP file with both PDBQT and LOG files
            import zipfile
            import tempfile
            import atexit

            # Find log file
            log_paths = [
                os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_name}_log.txt"),
                os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}_log.txt"),
                os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"mol_{ligand.original_index}_log.txt")
            ]

            log_file = None
            for log_path in log_paths:
                if os.path.exists(log_path):
                    log_file = log_path
                    break

            # Create temporary ZIP file with proper error handling
            try:
                temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
                temp_zip_path = temp_zip.name
                temp_zip.close()

                # Register cleanup function
                def cleanup_temp_file():
                    try:
                        if os.path.exists(temp_zip_path):
                            os.unlink(temp_zip_path)
                    except:
                        pass

                atexit.register(cleanup_temp_file)

                with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                    # Add PDBQT file
                    if os.path.exists(found_file):
                        zf.write(found_file, f"{clean_name}_docked.pdbqt")

                    # Add LOG file if found
                    if log_file and os.path.exists(log_file):
                        zf.write(log_file, f"{clean_name}_docking_log.txt")

                # Verify ZIP file was created successfully
                if not os.path.exists(temp_zip_path) or os.path.getsize(temp_zip_path) == 0:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create ZIP file - file is empty or missing"
                    )

                filename = f"{clean_name}_docking_files.zip"

                # Create a custom FileResponse that cleans up the temp file
                class CleanupFileResponse(FileResponse):
                    def __init__(self, *args, **kwargs):
                        self.temp_path = kwargs.pop('temp_path', None)
                        super().__init__(*args, **kwargs)

                    async def __call__(self, scope, receive, send):
                        try:
                            await super().__call__(scope, receive, send)
                        finally:
                            # Clean up temp file after response is sent
                            if self.temp_path and os.path.exists(self.temp_path):
                                try:
                                    os.unlink(self.temp_path)
                                except:
                                    pass

                return CleanupFileResponse(
                    path=temp_zip_path,
                    media_type="application/zip",
                    filename=filename,
                    temp_path=temp_zip_path
                )

            except Exception as e:
                # Clean up temp file on error
                try:
                    if 'temp_zip_path' in locals() and os.path.exists(temp_zip_path):
                        os.unlink(temp_zip_path)
                except:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create ZIP file: {str(e)}"
                )
        
        else:  # Default to PDBQT format
            filename = f"{clean_name}_docked.pdbqt"
            return FileResponse(
                path=found_file,
                media_type="chemical/x-pdbqt",
                filename=filename
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download file: {str(e)}"
        )