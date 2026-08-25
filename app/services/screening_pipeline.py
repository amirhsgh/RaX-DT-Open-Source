"""
Main screening pipeline service that integrates all processing steps.
This service wraps your existing Python scripts into a FastAPI-compatible service.
"""

import os
import asyncio
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any


from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.database.connection import async_session_factory, get_sync_database
from app.database.models import (
    ScreeningJob, Ligand, Protein, DockingResult,
    JobStatus, ProcessingStage
)
from app.services.ligand_processor import LigandProcessor
from app.services.protein_processor import ProteinProcessor  
from app.services.docking_service import DockingService

logger = logging.getLogger(__name__)


class ScreeningPipeline:
    """Main pipeline orchestrator for virtual screening workflow."""
    
    def __init__(self):
        self.ligand_processor = LigandProcessor()
        self.protein_processor = ProteinProcessor()
        self.docking_service = DockingService()
    

    def run_complete_pipeline_sync(self, job_id: str, progress_callback=None) -> Dict[str, Any]:
        """
        Run the complete screening pipeline synchronously for Celery workers.
        This is the sync version for background task processing.
        """
        
        with get_sync_database() as db:
            try:
                # Get job details
                result = db.execute(
                    select(ScreeningJob).where(ScreeningJob.id == job_id)
                )
                job = result.scalar_one_or_none()
                
                if not job:
                    logger.error(f"Job {job_id} not found")
                    return {"success": False, "error": "Job not found"}
                
                logger.info(f"🚀 Starting pipeline for job {job_id}: {job.name}")
                
                # Step 1: Prepare ligands (3D generation)
                self._update_job_status_sync(
                    db, job, JobStatus.RUNNING, ProcessingStage.LIGAND_PREP_3D
                )
                if progress_callback:
                    progress_callback({"completed": 1, "total": 5, "percentage": 20, "status": "Preparing ligands..."})
                
                self._step1_prepare_ligands_3d_sync(db, job)
                
                # Step 2: Skip protein preparation - use uploaded protein directly
                logger.info(f"📋 Step 2: Skipping protein preparation - using uploaded protein directly")
                
                # Create protein record in database without preparation
                if job.protein_file_path:
                    protein_filename = os.path.basename(job.protein_file_path)
                    protein_name = os.path.splitext(protein_filename)[0]
                    
                    protein = Protein(
                        job_id=job.id,
                        name=protein_name,
                        original_file_path=job.protein_file_path,
                        prepared_pdbqt_path=job.protein_file_path,  # Use original file directly
                        file_size=os.path.getsize(job.protein_file_path) if os.path.exists(job.protein_file_path) else 0,
                        status=JobStatus.COMPLETED,
                        preparation_pH=job.pH or 7.4
                    )
                    db.add(protein)
                    
                if progress_callback:
                    progress_callback({"completed": 2, "total": 5, "percentage": 40, "status": "Protein ready..."})
                
                # Step 3: Advanced ligand preparation
                self._update_job_status_sync(
                    db, job, JobStatus.RUNNING, ProcessingStage.LIGAND_PREP_ADVANCED
                )
                if progress_callback:
                    progress_callback({"completed": 3, "total": 5, "percentage": 60, "status": "Advanced ligand preparation..."})
                
                self._step3_advanced_ligand_prep_sync(db, job)
                
                # Step 4: Molecular docking
                self._update_job_status_sync(
                    db, job, JobStatus.RUNNING, ProcessingStage.DOCKING
                )
                if progress_callback:
                    progress_callback({"completed": 4, "total": 5, "percentage": 80, "status": "Running molecular docking..."})
                
                self._step4_molecular_docking_sync(db, job, progress_callback)
                
                # Step 5: Finalize results
                self._update_job_status_sync(
                    db, job, JobStatus.COMPLETED, ProcessingStage.RESULTS
                )
                if progress_callback:
                    progress_callback({"completed": 5, "total": 5, "percentage": 100, "status": "Completed successfully!"})
                
                job.completed_at = datetime.utcnow()
                job.progress_percentage = 100.0
                db.commit()
                
                logger.info(f"✅ Pipeline completed successfully for job {job_id}")
                
                return {
                    "success": True,
                    "job_id": job_id,
                    "message": "Pipeline completed successfully"
                }
                
            except Exception as e:
                logger.error(f"❌ Pipeline failed for job {job_id}: {str(e)}", exc_info=True)
                self._handle_job_error_sync(db, job_id, str(e))
                return {
                    "success": False,
                    "job_id": job_id,
                    "error": str(e)
                }


    async def run_complete_pipeline(self, job_id: str, progress_callback=None) -> Dict[str, Any]:
        """
        Run the complete screening pipeline for a job.
        This is the main entry point that orchestrates all steps.
        """
        
        async with async_session_factory() as db:
            try:
                # Get job details
                result = await db.execute(
                    select(ScreeningJob).where(ScreeningJob.id == job_id)
                )
                job = result.scalar_one_or_none()
                
                if not job:
                    logger.error(f"Job {job_id} not found")
                    return
                
                logger.info(f"🚀 Starting pipeline for job {job_id}: {job.name}")
                
                # Step 1: Prepare ligands (3D generation)
                await self._update_job_status(
                    db, job, JobStatus.RUNNING, ProcessingStage.LIGAND_PREP_3D
                )
                if progress_callback:
                    progress_callback({"completed": 1, "total": 5, "percentage": 10})
                
                await self._step1_prepare_ligands_3d(db, job)
                
                # Step 2: Skip protein preparation - use uploaded protein directly
                logger.info(f"📋 Step 2: Skipping protein preparation - using uploaded protein directly")
                
                # Step 3: Advanced ligand preparation
                await self._update_job_status(
                    db, job, JobStatus.RUNNING, ProcessingStage.LIGAND_PREP_ADVANCED
                )
                if progress_callback:
                    progress_callback({"completed": 2, "total": 4, "percentage": 40})
                
                await self._step3_advanced_ligand_prep(db, job)
                
                # Step 4: Molecular docking  
                await self._update_job_status(
                    db, job, JobStatus.RUNNING, ProcessingStage.DOCKING
                )
                if progress_callback:
                    progress_callback({"completed": 3, "total": 4, "percentage": 60})
                
                await self._step4_molecular_docking(db, job, progress_callback)
                
                # Step 4: Finalize results
                await self._update_job_status(
                    db, job, JobStatus.COMPLETED, ProcessingStage.RESULTS
                )
                if progress_callback:
                    progress_callback({"completed": 4, "total": 4, "percentage": 100, "status": "Completed successfully!"})
                
                job.completed_at = datetime.utcnow()
                job.progress_percentage = 100.0
                await db.commit()
                
                logger.info(f"✅ Pipeline completed successfully for job {job_id}")
                
                return {
                    "success": True,
                    "job_id": job_id,
                    "message": "Pipeline completed successfully"
                }
                
            except Exception as e:
                logger.error(f"❌ Pipeline failed for job {job_id}: {str(e)}", exc_info=True)
                await self._handle_job_error(db, job_id, str(e))
                return {
                    "success": False,
                    "job_id": job_id,
                    "error": str(e)
                }
    
    async def _step1_prepare_ligands_3d(self, db: AsyncSession, job: ScreeningJob) -> None:
        """Step 1: Generate 3D conformations for ligands."""
        logger.info(f"🔬 Step 1: Generating 3D conformations for job {job.id}")
        
        try:
            # Debug info
            logger.info(f"🔍 DEBUG: Ligand file path: {job.ligand_file_path}")
            logger.info(f"🔍 DEBUG: Job ID: {job.id}")
            
            # Check if ligand file exists
            if not os.path.exists(job.ligand_file_path):
                raise FileNotFoundError(f"Ligand file not found: {job.ligand_file_path}")
            
            logger.info(f"📂 Ligand file exists, size: {os.path.getsize(job.ligand_file_path)} bytes")
            
            # Process ligand file to generate 3D structures
            logger.info("🚀 Starting ligand processor...")
            # Extract original filename from path
            original_filename = None
            if hasattr(job, 'config') and job.config:
                original_filename = job.config.get('original_ligand_filename')
            if not original_filename and job.ligand_file_path:
                original_filename = os.path.basename(job.ligand_file_path)

            result = await self.ligand_processor.generate_initial_3d_structures(
                input_file=job.ligand_file_path,
                job_id=str(job.id),
                original_filename=original_filename
            )
            logger.info(f"✅ Ligand processor completed with result: {result}")
            
            # Create ligand records in database
            await self._create_ligand_records(db, job, result)
            
            job.progress_percentage = 25.0
            await db.commit()
            logger.info(f"✅ Step 1 completed successfully for job {job.id}")
            
        except Exception as e:
            logger.error(f"❌ Step 1 failed for job {job.id}: {str(e)}", exc_info=True)
            raise
    
    
    async def _step3_advanced_ligand_prep(self, db: AsyncSession, job: ScreeningJob) -> None:
        """Step 3: Advanced ligand preparation (tautomers, protomers, stereoisomers)."""
        logger.info(f"⚗️ Step 3: Advanced ligand preparation for job {job.id}")
        
        try:
            # Get initial 3D ligands file
            initial_3d_file = await self._get_step1_output_file(str(job.id))
            
            # Run advanced preparation
            result = await self.ligand_processor.run_advanced_preparation(
                input_file=initial_3d_file,
                job_id=str(job.id),
                pH=job.pH,
                max_tautomers=job.max_tautomers,
                max_stereoisomers=job.max_stereoisomers,
                use_stable_tautomers=job.use_stable_tautomers
            )
            
            # Update ligand records with prepared structures
            await self._update_ligand_records(db, job, result)
            
            job.progress_percentage = 60.0
            await db.commit()
            
        except Exception as e:
            logger.error(f"Step 3 failed: {str(e)}")
            raise
    
    async def _step4_molecular_docking(self, db: AsyncSession, job: ScreeningJob, progress_callback=None) -> None:
        """Step 4: Perform molecular docking."""
        logger.info(f"🎯 Step 4: Molecular docking for job {job.id}")
        
        try:
            # Get prepared ligands file
            ligands_file = await self._get_step3_output_file(str(job.id))
            
            # Use uploaded protein directly (no preparation needed)
            protein_file = job.protein_file_path
            if not protein_file or not os.path.exists(protein_file):
                raise FileNotFoundError(f"Uploaded protein file not found: {protein_file}")
            
            logger.info(f"📁 Using uploaded protein directly: {protein_file}")
            logger.info(f"📁 Using prepared ligands: {ligands_file}")
            
            
            # Create a wrapper for the progress callback
            def docking_progress_wrapper(progress):
                try:
                    if progress_callback:
                        # Convert docking progress to overall pipeline progress (60-95%)
                        overall_progress = 60 + (progress.get('percentage', 0) * 0.35)
                        progress_callback({
                            "completed": progress.get('completed', 0),
                            "total": progress.get('total', 0),
                            "percentage": overall_progress
                        })
                except Exception as e:
                    logger.warning(f"Progress callback failed: {e}")

            # Run docking
            results = await self.docking_service.run_parallel_docking(
                ligands_file=ligands_file,
                protein_file=protein_file,
                job_id=str(job.id),
                docking_params={
                    "center_x": job.center_x,
                    "center_y": job.center_y, 
                    "center_z": job.center_z,
                    "size_x": job.size_x,
                    "size_y": job.size_y,
                    "size_z": job.size_z,
                    "exhaustiveness": job.exhaustiveness,
                    "num_modes": job.num_modes
                },
                progress_callback=docking_progress_wrapper,
                ref_ligand_file=job.ref_ligand_file_path  # Use reference ligand for autobox
            )
            
            # Save docking results to database
            await self._save_docking_results(db, job, results)
            
            job.progress_percentage = 95.0
            await db.commit()
            
        except Exception as e:
            logger.error(f"Step 4 failed: {str(e)}")
            raise
    
    async def _create_ligand_records(
        self, 
        db: AsyncSession, 
        job: ScreeningJob, 
        ligand_data: Dict[str, Any]
    ) -> None:
        """Create ligand records in database from processing results."""
        
        for i, (mol_id, data) in enumerate(ligand_data["molecules"].items()):
            ligand = Ligand(
                job_id=job.id,
                name=data.get("name", f"Molecule_{i+1}"),
                original_index=i + 1,
                smiles=data.get("smiles"),
                molecular_weight=data.get("molecular_weight"),
                logp=data.get("logp"),
                hbd=data.get("hbd"),
                hba=data.get("hba"),
                tpsa=data.get("tpsa"),
                rotatable_bonds=data.get("rotatable_bonds"),
                status=JobStatus.COMPLETED if data.get("success") else JobStatus.FAILED,
                error_message=data.get("error"),
                initial_3d_path=data.get("output_file")
            )
            
            db.add(ligand)
        
        await db.commit()
    
    
    async def _update_ligand_records(
        self,
        db: AsyncSession,
        job: ScreeningJob,
        prep_results: Dict[str, Any]
    ) -> None:
        """Update ligand records with advanced preparation results."""
        
        # Get existing ligands
        result = await db.execute(
            select(Ligand).where(Ligand.job_id == job.id)
        )
        ligands = result.scalars().all()
        
        # Update all ligands with the same prepared structure path
        # Since advanced preparation processes the entire file together
        final_structure_path = prep_results.get("final_structure")
        pdbqt_directory = prep_results.get("pdbqt_directory")
        
        if final_structure_path:
            for ligand in ligands:
                ligand.prepared_structure_path = final_structure_path
                # For PDBQT path, we can construct it based on the directory and ligand index
                if pdbqt_directory:
                    ligand.pdbqt_path = f"{pdbqt_directory}/mol_{ligand.original_index}.pdbqt"
                
                # Mark as completed (successful advanced preparation)
                ligand.status = JobStatus.COMPLETED
                ligand.prep_completed_at = datetime.utcnow()
        
        await db.commit()
    
    def _update_ligand_records_sync(
        self,
        db: Session,
        job: ScreeningJob,
        prep_results: Dict[str, Any]
    ) -> None:
        """Update ligand records with advanced preparation results (sync version)."""
        
        logger.info(f"🔧 Updating ligand records for job {job.id}")
        logger.info(f"🔧 Prep results keys: {list(prep_results.keys())}")
        
        # Get existing ligands
        ligands = db.query(Ligand).filter(Ligand.job_id == job.id).all()
        logger.info(f"🔧 Found {len(ligands)} ligand records in database")
        
        # Update all ligands with the same prepared structure path
        # Since advanced preparation processes the entire file together
        final_structure_path = prep_results.get("final_structure")
        pdbqt_directory = prep_results.get("pdbqt_directory")
        
        logger.info(f"🔧 Final structure path: {final_structure_path}")
        logger.info(f"🔧 PDBQT directory: {pdbqt_directory}")
        
        if final_structure_path:
            for i, ligand in enumerate(ligands):
                logger.info(f"🔧 Updating ligand {i+1}/{len(ligands)}: {ligand.name}")
                ligand.prepared_structure_path = final_structure_path
                
                # For PDBQT path, we can construct it based on the directory and ligand index
                if pdbqt_directory:
                    pdbqt_path = f"{pdbqt_directory}/mol_{ligand.original_index}.pdbqt"
                    ligand.pdbqt_path = pdbqt_path
                    logger.info(f"🔧   Set PDBQT path: {pdbqt_path}")
                
                # Mark as completed (successful advanced preparation)
                ligand.status = JobStatus.COMPLETED
                ligand.prep_completed_at = datetime.utcnow()
                logger.info(f"🔧   Updated ligand {ligand.name} with prepared path: {final_structure_path}")
        else:
            logger.error("🔧 No final_structure path found in prep_results!")
        
        logger.info(f"✅ Updated {len(ligands)} ligand records with prepared structure paths")
    
    def _create_ligand_records_sync(
        self,
        db: Session,
        job: ScreeningJob,
        prep_results: Dict[str, Any]
    ) -> None:
        """Create ligand records in database from 3D preparation results (sync version)."""
        
        logger.info(f"🔧 Creating ligand records for job {job.id}")
        molecules = prep_results.get("molecules", {})
        failed = prep_results.get("failed", [])
        
        logger.info(f"🔧 Found {len(molecules)} successful molecules and {len(failed)} failed molecules")
        
        # Create records for successful molecules
        for mol_key, mol_data in molecules.items():
            logger.info(f"🔧 Creating ligand record for {mol_key}: {mol_data.get('name')}")
            
            ligand = Ligand(
                job_id=job.id,
                name=mol_data.get("name", mol_key),
                original_index=int(mol_key.split("_")[1]) if "_" in mol_key else 1,
                smiles=mol_data.get("smiles"),
                molecular_weight=mol_data.get("molecular_weight"),
                logp=mol_data.get("logp"),
                hbd=mol_data.get("hbd"),
                hba=mol_data.get("hba"),
                tpsa=mol_data.get("tpsa"),
                rotatable_bonds=mol_data.get("rotatable_bonds"),
                status=JobStatus.COMPLETED,  # Successfully processed in Step 1
                initial_3d_path=mol_data.get("output_file"),
                prep_started_at=datetime.utcnow(),
                prep_completed_at=datetime.utcnow()
            )
            
            db.add(ligand)
        
        # Create records for failed molecules
        for failed_mol in failed:
            logger.info(f"🔧 Creating failed ligand record for {failed_mol.get('name')}")
            
            ligand = Ligand(
                job_id=job.id,
                name=failed_mol.get("name", f"Molecule_{failed_mol.get('index')}"),
                original_index=failed_mol.get("index", 1),
                status=JobStatus.FAILED,
                error_message=failed_mol.get("error"),
                prep_started_at=datetime.utcnow()
            )
            
            db.add(ligand)
        
        # Update job totals
        job.total_ligands = len(molecules) + len(failed)
        job.processed_ligands = len(molecules)
        job.failed_ligands = len(failed)
        
        logger.info(f"✅ Created {len(molecules)} successful and {len(failed)} failed ligand records")
    
    async def _save_docking_results(
        self,
        db: AsyncSession,
        job: ScreeningJob,
        docking_results: Dict[str, Any]
    ) -> None:
        """Save docking results to database."""
        
        for result_data in docking_results.get("results", []):
            # Find corresponding ligand by drug_name or ligand_id
            ligand_result = await db.execute(
                select(Ligand).where(
                    Ligand.job_id == job.id,
                    Ligand.name == result_data.get("drug_name")
                )
            )
            ligand = ligand_result.scalar_one_or_none()
            
            # If not found by name, try by ligand_id pattern (mol_1 -> index 1)
            if not ligand and result_data.get("ligand_id"):
                try:
                    ligand_id = result_data.get("ligand_id")
                    if ligand_id.startswith("mol_"):
                        original_index = int(ligand_id.split("_")[1])
                        ligand_result = await db.execute(
                            select(Ligand).where(
                                Ligand.job_id == job.id,
                                Ligand.original_index == original_index
                            )
                        )
                        ligand = ligand_result.scalar_one_or_none()
                except (ValueError, IndexError):
                    pass
            
            if ligand:
                # Save both successful and failed docking results
                # For failed docking, use a large positive value to indicate failure
                # This ensures database constraint is satisfied while clearly marking failures
                binding_affinity = result_data.get("best_affinity")
                if binding_affinity is None and not result_data.get("success"):
                    binding_affinity = 999.9  # Large positive value indicates failed docking
                
                docking_result = DockingResult(
                    job_id=job.id,
                    ligand_id=ligand.id,
                    binding_affinity=binding_affinity,
                    mode=result_data.get("best_mode", 1),
                    rmsd_lb=result_data.get("rmsd_lb"),
                    rmsd_ub=result_data.get("rmsd_ub"),
                    processing_time=result_data.get("processing_time", 0),
                    status=JobStatus.COMPLETED if result_data.get("success") else JobStatus.FAILED,
                    error_message=result_data.get("error"),
                    additional_modes=result_data.get("all_modes", result_data.get("detailed_modes")),
                    output_pdbqt_path=result_data.get("output_file")
                )
                
                db.add(docking_result)
            else:
                logger.warning(f"Could not find ligand for result: {result_data.get('drug_name', 'Unknown')}")
        
        # Update job statistics
        successful_results = len([r for r in docking_results.get("results", []) if r.get("success")])
        job.processed_ligands = len(docking_results.get("results", []))
        job.failed_ligands = job.processed_ligands - successful_results
        
        await db.commit()
    
    async def _update_job_status(
        self,
        db: AsyncSession,
        job: ScreeningJob,
        status: JobStatus,
        stage: ProcessingStage
    ) -> None:
        """Update job status and stage."""
        job.status = status
        job.current_stage = stage
        await db.commit()
    
    async def _update_docking_progress(
        self,
        db: AsyncSession, 
        job: ScreeningJob,
        progress: Dict[str, Any]
    ) -> None:
        """Update docking progress."""
        job.processed_ligands = progress.get("completed", 0)
        job.progress_percentage = 60.0 + (progress.get("percentage", 0) * 0.35)  # 60-95%
        await db.commit()
    
    async def _handle_job_error(self, db: AsyncSession, job_id: str, error_message: str) -> None:
        """Handle job error by updating status."""
        try:
            result = await db.execute(
                select(ScreeningJob).where(ScreeningJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            
            if job:
                job.status = JobStatus.FAILED
                job.error_message = error_message
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to update job error status: {e}")
    
    async def _get_step1_output_file(self, job_id: str) -> str:
        """Get the output file from step 1 (initial 3D structures)."""
        return f"data/temp/{job_id}/initial_3d_ligands.sdf"
    
    async def _get_step3_output_file(self, job_id: str) -> str:
        """Get the output file from step 3 (advanced preparation)."""
        return f"data/temp/{job_id}/final_prepared_3d_library.sdf"
    
    async def _get_protein_output_file(self, job_id: str) -> str:
        """Get the prepared protein PDBQT file."""
        return f"data/temp/{job_id}/receptor.pdbqt"
    
    # ========== SYNC HELPER METHODS FOR CELERY ==========
    
    def _update_job_status_sync(
        self,
        db: Session,
        job: ScreeningJob,
        status: JobStatus,
        stage: ProcessingStage
    ) -> None:
        """Update job status and stage (sync version)."""
        job.status = status
        job.current_stage = stage
        db.commit()
    
    def _handle_job_error_sync(self, db: Session, job_id: str, error_message: str) -> None:
        """Handle job error by updating status (sync version)."""
        try:
            result = db.execute(
                select(ScreeningJob).where(ScreeningJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            
            if job:
                job.status = JobStatus.FAILED
                job.error_message = error_message
                db.commit()
        except Exception as e:
            logger.error(f"Failed to update job error status: {e}")
    
    def _step1_prepare_ligands_3d_sync(self, db: Session, job: ScreeningJob) -> None:
        """Step 1: Generate 3D conformations for ligands (sync version)."""
        logger.info(f"🔬 Step 1: Generating 3D conformations for job {job.id}")
        
        try:
            if not job.ligand_file_path:
                raise RuntimeError("No ligand file found for preparation")
                
            logger.info(f"Processing ligand file: {job.ligand_file_path}")
            
            # Run 3D ligand preparation using the ligand processor
            import asyncio
            
            # Run async ligand preparation in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                # Extract original filename from path
                original_filename = None
                if hasattr(job, 'config') and job.config:
                    original_filename = job.config.get('original_ligand_filename')
                if not original_filename and job.ligand_file_path:
                    original_filename = os.path.basename(job.ligand_file_path)

                prep_result = loop.run_until_complete(
                    self.ligand_processor.generate_initial_3d_structures(
                        input_file=job.ligand_file_path,
                        job_id=str(job.id),
                        original_filename=original_filename
                    )
                )
            finally:
                loop.close()
            
            # Check if preparation was successful and save output to temp directory
            if prep_result.get("success"):
                initial_3d_file = prep_result.get("output_file")
                logger.info(f"✅ Initial 3D preparation completed: {initial_3d_file}")
                
                # Create ligand records in database based on processed molecules
                self._create_ligand_records_sync(db, job, prep_result)
                
                # Ensure the file is in the expected location for Step 3
                temp_dir = Path(settings.TEMP_DIR) / str(job.id)
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                expected_path = temp_dir / "initial_3d_ligands.sdf"
                if Path(initial_3d_file).exists():
                    # Only copy if source and destination are different
                    if Path(initial_3d_file).resolve() != expected_path.resolve():
                        import shutil
                        shutil.copy2(initial_3d_file, expected_path)
                        logger.info(f"✅ Initial 3D file copied to: {expected_path}")
                    else:
                        logger.info(f"✅ Initial 3D file already in correct location: {expected_path}")
                else:
                    raise RuntimeError(f"3D preparation output file not found: {initial_3d_file}")
                
            else:
                raise RuntimeError(f"3D ligand preparation failed: {prep_result.get('error', 'Unknown error')}")
            
            job.progress_percentage = 25.0
            db.commit()
            
            logger.info(f"✅ Step 1 completed for job {job.id}")
            
        except Exception as e:
            logger.error(f"❌ Step 1 failed for job {job.id}: {str(e)}")
            raise
    
    
    def _step3_advanced_ligand_prep_sync(self, db: Session, job: ScreeningJob) -> None:
        """Step 3: Advanced ligand preparation (sync version)."""
        logger.info(f"⚗️ Step 3: Advanced ligand preparation for job {job.id}")
        
        try:
            # Get the initial 3D ligands from Step 1
            temp_dir = Path(settings.TEMP_DIR) / str(job.id)
            initial_3d_file = temp_dir / "initial_3d_ligands.sdf"
            
            if not initial_3d_file.exists():
                raise RuntimeError(f"Initial 3D ligands file not found: {initial_3d_file}")
            
            logger.info(f"Processing advanced preparation from: {initial_3d_file}")
            
            # Run advanced ligand preparation using the ligand processor
            import asyncio
            
            # Run async ligand preparation in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                prep_result = loop.run_until_complete(
                    self.ligand_processor.run_advanced_preparation(
                        input_file=str(initial_3d_file),
                        job_id=str(job.id),
                        pH=job.pH or 7.4,
                        max_tautomers=job.max_tautomers or 1,
                        max_stereoisomers=job.max_stereoisomers or 1,
                        use_stable_tautomers=job.use_stable_tautomers
                    )
                )
            finally:
                loop.close()
            
            # Check if preparation was successful
            if prep_result.get("success"):
                final_file = prep_result.get("final_structure")
                logger.info(f"✅ Advanced ligand preparation completed: {final_file}")
                
                # Save the final prepared ligands file path for docking step
                final_ligand_path = temp_dir / "final_prepared_ligands.sdf"
                if Path(final_file).exists():
                    # Copy/link the final file to a standard location, but only if different
                    if Path(final_file).resolve() != final_ligand_path.resolve():
                        import shutil
                        shutil.copy2(final_file, final_ligand_path)
                        logger.info(f"✅ Final ligands copied to: {final_ligand_path}")
                    else:
                        logger.info(f"✅ Final ligands already in correct location: {final_ligand_path}")
                
                # Update ligand records with prepared structure paths
                logger.info(f"🔧 About to call _update_ligand_records_sync for job {job.id}")
                self._update_ligand_records_sync(db, job, prep_result)
                logger.info(f"🔧 Completed _update_ligand_records_sync for job {job.id}")
                
            else:
                raise RuntimeError(f"Advanced ligand preparation failed: {prep_result.get('error', 'Unknown error')}")
            
            job.progress_percentage = 75.0
            db.commit()
            
            logger.info(f"✅ Step 3 completed for job {job.id}")
            
        except Exception as e:
            logger.error(f"❌ Step 3 failed for job {job.id}: {str(e)}")
            raise
    
    def _step4_molecular_docking_sync(self, db: Session, job: ScreeningJob, progress_callback=None) -> None:
        """Step 4: Run molecular docking (sync version)."""
        logger.info(f"🎯 Step 4: Running molecular docking for job {job.id}")
        
        try:
            # Run actual docking using the docking service
            
            # Create docking parameters
            docking_params = {
                "center_x": job.center_x or 15.2,
                "center_y": job.center_y or 18.7, 
                "center_z": job.center_z or 12.3,
                "size_x": job.size_x or 20.0,
                "size_y": job.size_y or 20.0,
                "size_z": job.size_z or 20.0,
                "exhaustiveness": job.exhaustiveness or 32,
                "num_modes": job.num_modes or 9
            }
            
            # Use uploaded protein directly (no preparation needed)
            if not job.protein_file_path or not os.path.exists(job.protein_file_path):
                raise RuntimeError(f"Uploaded protein file not found: {job.protein_file_path}")
            
            # Get prepared ligand files from Step 3
            sample_ligand = db.query(Ligand).filter(Ligand.job_id == job.id).first()
            
            logger.info(f"🔧 Step 4: Found sample ligand: {sample_ligand.name if sample_ligand else 'None'}")
            if sample_ligand:
                logger.info(f"🔧 Step 4: Sample ligand prepared_structure_path: {sample_ligand.prepared_structure_path}")
            
            if not sample_ligand or not sample_ligand.prepared_structure_path:
                raise RuntimeError("Prepared ligand files not found. Advanced ligand preparation may have failed.")
            
            # Use the prepared ligand directory to find the final output
            ligand_prep_dir = os.path.dirname(sample_ligand.prepared_structure_path)
            
            # Look for the final prepared ligand file from Step 3
            potential_files = [
                os.path.join(ligand_prep_dir, "final_prepared_3d_library.sdf"),
                os.path.join(ligand_prep_dir, "step6_final.sdf"),
                os.path.join(ligand_prep_dir, "final_ligands.sdf")
            ]
            
            prepared_ligand_file = None
            for pf in potential_files:
                if os.path.exists(pf):
                    prepared_ligand_file = pf
                    break
            
            if not prepared_ligand_file:
                # Last resort: use the job's temp directory
                temp_dir = Path(settings.TEMP_DIR) / str(job.id)
                final_ligand = temp_dir / "final_prepared_ligands.sdf"
                if final_ligand.exists():
                    prepared_ligand_file = str(final_ligand)
                else:
                    raise RuntimeError("No final prepared ligand file found from advanced preparation step")
            
            logger.info(f"   Using uploaded protein directly: {job.protein_file_path}")
            logger.info(f"   Using prepared ligands: {prepared_ligand_file}")

            # Copy receptor to temp directory for visualization
            temp_receptor_path = os.path.join(settings.TEMP_DIR, str(job.id), "receptor.pdbqt")
            os.makedirs(os.path.dirname(temp_receptor_path), exist_ok=True)
            if not os.path.exists(temp_receptor_path):
                import shutil
                shutil.copy2(job.protein_file_path, temp_receptor_path)
                logger.info(f"✅ Copied receptor to temp directory: {temp_receptor_path}")

            # Run docking using synchronous version for Celery workers
            results = self.docking_service.run_parallel_docking_sync(
                ligands_file=prepared_ligand_file,  # Use prepared ligands from Step 3
                protein_file=job.protein_file_path,  # Use uploaded protein directly
                job_id=str(job.id),
                docking_params=docking_params,
                progress_callback=progress_callback,
                ref_ligand_file=job.ref_ligand_file_path  # Use reference ligand for autobox
            )
            
            # Save docking results to database (sync version)
            self._save_docking_results_sync(db, job, results)
            
            job.progress_percentage = 95.0
            db.commit()
            
            logger.info(f"✅ Step 4 completed for job {job.id}")
            
        except Exception as e:
            logger.error(f"❌ Step 4 failed for job {job.id}: {str(e)}")
            raise
    
    def _save_docking_results_sync(
        self, 
        db: Session, 
        job: ScreeningJob, 
        docking_results: Dict[str, Any]
    ) -> None:
        """Save docking results to database (sync version)."""
        
        for result_data in docking_results.get("results", []):
            # Find corresponding ligand by drug_name or ligand_id
            ligand = None

            # First try to find by ligand_id pattern (mol_1 -> index 1) - this is more reliable
            if result_data.get("ligand_id"):
                try:
                    ligand_id = result_data.get("ligand_id")
                    if ligand_id.startswith("mol_"):
                        original_index = int(ligand_id.split("_")[1])
                        ligand_result = db.execute(
                            select(Ligand).where(
                                Ligand.job_id == job.id,
                                Ligand.original_index == original_index
                            )
                        )
                        ligand = ligand_result.scalar_one_or_none()
                except (ValueError, IndexError):
                    pass

            # If not found by ligand_id, try by drug_name (but handle duplicates)
            if not ligand and result_data.get("drug_name"):
                ligand_result = db.execute(
                    select(Ligand).where(
                        Ligand.job_id == job.id,
                        Ligand.name == result_data.get("drug_name")
                    ).limit(1)  # Take only the first match to avoid MultipleResultsFound
                )
                ligand = ligand_result.scalar_one_or_none()

            if ligand:
                # Check if docking result already exists to avoid duplicates
                existing_result = db.execute(
                    select(DockingResult).where(
                        DockingResult.job_id == job.id,
                        DockingResult.ligand_id == ligand.id
                    )
                ).scalar_one_or_none()

                if existing_result:
                    logger.warning(f"Docking result already exists for ligand {ligand.name} (ID: {ligand.id}), skipping...")
                    continue

                # Save both successful and failed docking results
                # For failed docking, use a large positive value to indicate failure
                # This ensures database constraint is satisfied while clearly marking failures
                binding_affinity = result_data.get("best_affinity")
                if binding_affinity is None and not result_data.get("success"):
                    binding_affinity = 999.9  # Large positive value indicates failed docking

                docking_result = DockingResult(
                    job_id=job.id,
                    ligand_id=ligand.id,
                    binding_affinity=binding_affinity,
                    mode=result_data.get("best_mode", 1),
                    rmsd_lb=result_data.get("rmsd_lb"),
                    rmsd_ub=result_data.get("rmsd_ub"),
                    processing_time=result_data.get("processing_time", 0),
                    status=JobStatus.COMPLETED if result_data.get("success") else JobStatus.FAILED,
                    error_message=result_data.get("error"),
                    additional_modes=result_data.get("all_modes", result_data.get("detailed_modes")),
                    output_pdbqt_path=result_data.get("output_file")
                )

                db.add(docking_result)
                logger.debug(f"Added docking result for ligand {ligand.name} (ID: {ligand.id})")
            else:
                logger.warning(f"Could not find ligand for result: drug_name='{result_data.get('drug_name', 'Unknown')}', ligand_id='{result_data.get('ligand_id', 'Unknown')}'")
        
        # Update job statistics
        successful_results = len([r for r in docking_results.get("results", []) if r.get("success")])
        job.processed_ligands = len(docking_results.get("results", []))
        job.failed_ligands = job.processed_ligands - successful_results
        
        db.commit()