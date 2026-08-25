"""CSV export service for docking results."""

import io
import csv
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import DockingResult, Ligand, ScreeningJob


class CSVExporter:
    """Service for exporting docking results to CSV format."""
    
    async def export_job_results(
        self,
        job_id: str,
        include_failed: bool = False,
        db: Optional[AsyncSession] = None
    ) -> str:
        """Export all docking results for a job to CSV format."""
        if not db:
            raise ValueError("Database session is required")
        
        # Query to get docking results with ligand information
        query = select(
            DockingResult.binding_affinity,
            DockingResult.mode,
            DockingResult.rmsd_lb,
            DockingResult.rmsd_ub,
            DockingResult.processing_time,
            DockingResult.status,
            DockingResult.error_message,
            Ligand.name.label('ligand_name'),
            Ligand.original_index,
            Ligand.smiles,
            Ligand.molecular_weight,
            Ligand.logp,
            Ligand.hbd,
            Ligand.hba,
            Ligand.tpsa,
            Ligand.rotatable_bonds
        ).select_from(
            DockingResult.__table__.join(Ligand.__table__)
        ).where(
            DockingResult.job_id == job_id
        )
        
        if not include_failed:
            query = query.where(DockingResult.status == 'completed')
        
        query = query.order_by(DockingResult.binding_affinity)
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        # Create CSV content
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        headers = [
            'Ligand_Name',
            'Original_Index', 
            'SMILES',
            'Binding_Affinity_kcal_mol',
            'Binding_Mode',
            'RMSD_Lower_Bound',
            'RMSD_Upper_Bound',
            'Processing_Time_seconds',
            'Molecular_Weight',
            'LogP',
            'Hydrogen_Bond_Donors',
            'Hydrogen_Bond_Acceptors',
            'TPSA',
            'Rotatable_Bonds',
            'Status'
        ]
        
        if include_failed:
            headers.append('Error_Message')
        
        writer.writerow(headers)
        
        # Write data rows
        for row in rows:
            data_row = [
                row.ligand_name,
                row.original_index,
                row.smiles or '',
                row.binding_affinity,
                row.mode,
                row.rmsd_lb or '',
                row.rmsd_ub or '',
                row.processing_time or '',
                row.molecular_weight or '',
                row.logp or '',
                row.hbd or '',
                row.hba or '',
                row.tpsa or '',
                row.rotatable_bonds or '',
                row.status
            ]
            
            if include_failed:
                data_row.append(row.error_message or '')
            
            writer.writerow(data_row)
        
        return output.getvalue()
    
    async def export_top_results(
        self,
        job_id: str,
        limit: int = 100,
        db: Optional[AsyncSession] = None
    ) -> str:
        """Export top N docking results to CSV format."""
        if not db:
            raise ValueError("Database session is required")
        
        # Query for top results
        query = select(
            DockingResult.binding_affinity,
            DockingResult.mode,
            DockingResult.rmsd_lb,
            DockingResult.rmsd_ub,
            DockingResult.processing_time,
            Ligand.name.label('ligand_name'),
            Ligand.original_index,
            Ligand.smiles,
            Ligand.molecular_weight,
            Ligand.logp
        ).select_from(
            DockingResult.__table__.join(Ligand.__table__)
        ).where(
            DockingResult.job_id == job_id
        ).where(
            DockingResult.status == 'completed'
        ).order_by(
            DockingResult.binding_affinity
        ).limit(limit)
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        # Create CSV content
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        headers = [
            'Rank',
            'Ligand_Name',
            'Original_Index',
            'SMILES',
            'Binding_Affinity_kcal_mol',
            'Binding_Mode',
            'RMSD_Lower_Bound',
            'RMSD_Upper_Bound',
            'Processing_Time_seconds',
            'Molecular_Weight',
            'LogP'
        ]
        writer.writerow(headers)
        
        # Write data rows with ranking
        for rank, row in enumerate(rows, 1):
            data_row = [
                rank,
                row.ligand_name,
                row.original_index,
                row.smiles or '',
                row.binding_affinity,
                row.mode,
                row.rmsd_lb or '',
                row.rmsd_ub or '',
                row.processing_time or '',
                row.molecular_weight or '',
                row.logp or ''
            ]
            writer.writerow(data_row)
        
        return output.getvalue()
    
    async def export_job_summary(
        self,
        job_id: str,
        db: Optional[AsyncSession] = None
    ) -> str:
        """Export job summary statistics to CSV format."""
        if not db:
            raise ValueError("Database session is required")
        
        from sqlalchemy import func
        
        # Get job information
        job_result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = job_result.scalar_one_or_none()
        
        if not job:
            raise ValueError("Job not found")
        
        # Get statistics
        stats_result = await db.execute(
            select(
                func.count(DockingResult.id).label('total_results'),
                func.min(DockingResult.binding_affinity).label('best_affinity'),
                func.max(DockingResult.binding_affinity).label('worst_affinity'),
                func.avg(DockingResult.binding_affinity).label('average_affinity'),
                func.stddev(DockingResult.binding_affinity).label('stddev_affinity'),
                func.sum(DockingResult.processing_time).label('total_time')
            ).where(DockingResult.job_id == job_id)
        )
        stats = stats_result.first()
        
        # Create CSV content
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write job summary
        writer.writerow(['Job Summary'])
        writer.writerow(['Parameter', 'Value'])
        writer.writerow(['Job ID', job_id])
        writer.writerow(['Job Name', job.name])
        writer.writerow(['Total Ligands', job.total_ligands])
        writer.writerow(['Successful Dockings', stats.total_results or 0])
        writer.writerow(['Failed Dockings', job.failed_ligands])
        writer.writerow(['Success Rate (%)', f"{((stats.total_results or 0) / job.total_ligands * 100):.1f}" if job.total_ligands > 0 else "0.0"])
        writer.writerow(['Best Affinity (kcal/mol)', f"{stats.best_affinity:.2f}" if stats.best_affinity else "N/A"])
        writer.writerow(['Worst Affinity (kcal/mol)', f"{stats.worst_affinity:.2f}" if stats.worst_affinity else "N/A"])
        writer.writerow(['Average Affinity (kcal/mol)', f"{stats.average_affinity:.2f}" if stats.average_affinity else "N/A"])
        writer.writerow(['Standard Deviation', f"{stats.stddev_affinity:.2f}" if stats.stddev_affinity else "N/A"])
        writer.writerow(['Total Processing Time (hours)', f"{(stats.total_time or 0) / 3600:.2f}"])
        writer.writerow(['Created At', job.created_at.strftime('%Y-%m-%d %H:%M:%S')])
        writer.writerow(['Completed At', job.completed_at.strftime('%Y-%m-%d %H:%M:%S') if job.completed_at else "Not completed"])
        
        # Processing parameters
        writer.writerow([''])
        writer.writerow(['Processing Parameters'])
        writer.writerow(['pH', job.pH])
        writer.writerow(['Max Tautomers', job.max_tautomers])
        writer.writerow(['Max Stereoisomers', job.max_stereoisomers])
        writer.writerow(['Use Stable Tautomers', 'Yes' if job.use_stable_tautomers else 'No'])
        
        # Docking parameters
        writer.writerow([''])
        writer.writerow(['Docking Parameters'])
        writer.writerow(['Center X', job.center_x])
        writer.writerow(['Center Y', job.center_y])
        writer.writerow(['Center Z', job.center_z])
        writer.writerow(['Size X', job.size_x])
        writer.writerow(['Size Y', job.size_y])
        writer.writerow(['Size Z', job.size_z])
        writer.writerow(['Exhaustiveness', job.exhaustiveness])
        writer.writerow(['Number of Modes', job.num_modes])
        
        return output.getvalue()