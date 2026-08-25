"""API endpoints for 3D molecular visualization."""

import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, Ligand, DockingResult, ScreeningJob
from app.schemas.molecule_schemas import StructureVisualization

router = APIRouter()


@router.get("/structure/{ligand_id}", response_model=StructureVisualization)
async def get_ligand_structure(
    ligand_id: UUID,
    include_docked: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """Get 3D structure data for a ligand for visualization."""
    try:
        # Get ligand
        ligand_result = await db.execute(select(Ligand).where(Ligand.id == ligand_id))
        ligand = ligand_result.scalar_one_or_none()
        
        if not ligand:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ligand not found"
            )
        
        # Read original structure (convert to PDB format)
        pdb_content = None
        if ligand.prepared_structure_path and os.path.exists(ligand.prepared_structure_path):
            pdb_content = await _convert_to_pdb_content(ligand.prepared_structure_path)
        elif ligand.initial_3d_path and os.path.exists(ligand.initial_3d_path):
            pdb_content = await _convert_to_pdb_content(ligand.initial_3d_path)
        
        if not pdb_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Structure file not found or not accessible"
            )
        
        # Read PDBQT content if available
        pdbqt_content = None
        if ligand.pdbqt_path and os.path.exists(ligand.pdbqt_path):
            with open(ligand.pdbqt_path, 'r') as f:
                pdbqt_content = f.read()
        
        # Get docked structure if requested and available
        docked_structure = None
        binding_affinity = None
        
        if include_docked:
            docking_result = await db.execute(
                select(DockingResult)
                .where(DockingResult.ligand_id == ligand_id)
                .order_by(DockingResult.binding_affinity)
                .limit(1)
            )
            result = docking_result.scalar_one_or_none()
            
            if result:
                binding_affinity = result.binding_affinity
                
                # Try to read docked structure from temp directory first
                from app.core.config import settings

                # Try multiple file extensions (GNINA outputs .sdf by default, but we might have .pdbqt too)
                extensions = ['.sdf', '.pdbqt']
                temp_docked_path = None

                for ext in extensions:
                    # First try with ligand_id
                    test_path = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}{ext}")
                    print(f"🔍 Looking for ligand at: {test_path}")
                    print(f"🔍 File exists: {os.path.exists(test_path)}")

                    if os.path.exists(test_path):
                        temp_docked_path = test_path
                        break

                if temp_docked_path and os.path.exists(temp_docked_path):
                    with open(temp_docked_path, 'r') as f:
                        docked_structure = f.read()
                    print(f"✅ Loaded ligand from temp directory, size: {len(docked_structure)}")
                else:
                    # Try with ligand name if available
                    if ligand.name:
                        # Clean name for filename (remove spaces, special chars)
                        clean_name = ligand.name.replace(' ', '_').replace('/', '_').replace('\\', '_').replace('<', '').replace('>', '')

                        for ext in extensions:
                            temp_docked_path_name = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_name}{ext}")
                            print(f"🔍 Trying ligand name path: {temp_docked_path_name}")

                            if os.path.exists(temp_docked_path_name):
                                temp_docked_path = temp_docked_path_name
                                break

                        if temp_docked_path and os.path.exists(temp_docked_path):
                            with open(temp_docked_path, 'r') as f:
                                docked_structure = f.read()
                            print(f"✅ Loaded ligand by name from temp directory, size: {len(docked_structure)}")
                        else:
                            # Try looking in individual ligand subdirectories
                            ligand_subdir = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"ligand_{ligand_id}")
                            if os.path.exists(ligand_subdir):
                                # Look for docked files in subdirectory
                                for filename in os.listdir(ligand_subdir):
                                    if filename.endswith(('.sdf', '.pdbqt')):
                                        subdir_file_path = os.path.join(ligand_subdir, filename)
                                        with open(subdir_file_path, 'r') as f:
                                            docked_structure = f.read()
                                        print(f"✅ Loaded ligand from subdirectory: {subdir_file_path}, size: {len(docked_structure)}")
                                        break

                    # If we still haven't found the docked structure
                    if not docked_structure:
                        # Also try to extract name from ligand content if it has <Name> tags
                        if ligand.prepared_structure_path and os.path.exists(ligand.prepared_structure_path):
                                try:
                                    with open(ligand.prepared_structure_path, 'r') as f:
                                        content = f.read()
                                    extracted_name = _extract_molecule_name(content)
                                    if extracted_name:
                                        clean_extracted = extracted_name.replace(' ', '_').replace('/', '_').replace('\\', '_').replace('<', '').replace('>', '')
                                        temp_path_extracted = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_extracted}.pdbqt")
                                        print(f"🔍 Trying extracted name path: {temp_path_extracted}")
                                        if os.path.exists(temp_path_extracted):
                                            with open(temp_path_extracted, 'r') as f:
                                                docked_structure = f.read()
                                            print(f"✅ Loaded ligand by extracted name, size: {len(docked_structure)}")
                                except Exception as e:
                                    print(f"❌ Error extracting name: {e}")
                
                # If not found in temp, try original path
                if not docked_structure and result.output_pdbqt_path and os.path.exists(result.output_pdbqt_path):
                    with open(result.output_pdbqt_path, 'r') as f:
                        docked_structure = f.read()
        
        return StructureVisualization(
            ligand_id=ligand_id,
            ligand_name=ligand.name,
            pdb_content=pdb_content,
            pdbqt_content=pdbqt_content,
            docked_structure=docked_structure,
            binding_affinity=binding_affinity
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get structure: {str(e)}"
        )


@router.get("/protein/{job_id}")
async def get_protein_structure(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get protein structure for visualization."""
    try:
        from app.database import ScreeningJob, Protein
        
        # Get job and protein
        job_result = await db.execute(
            select(ScreeningJob).where(ScreeningJob.id == job_id)
        )
        job = job_result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job not found"
            )
        
        protein_result = await db.execute(
            select(Protein).where(Protein.job_id == job_id)
        )
        protein = protein_result.scalar_one_or_none()
        
        if not protein:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Protein not found for this job"
            )
        
        # Read protein structure from temp directory first
        pdb_content = None
        pdbqt_content = None
        
        # Try to read from temp directory (new location)
        from app.core.config import settings
        temp_protein_path = os.path.join(settings.TEMP_DIR, str(job_id), "receptor.pdbqt")
        print(f"🔍 Looking for protein at: {temp_protein_path}")
        print(f"🔍 File exists: {os.path.exists(temp_protein_path)}")

        if os.path.exists(temp_protein_path):
            with open(temp_protein_path, 'r') as f:
                pdbqt_content = f.read()
            print(f"✅ Loaded protein from temp directory, size: {len(pdbqt_content)}")
        else:
            # Try to get protein path from job
            job_result = await db.execute(
                select(ScreeningJob).where(ScreeningJob.id == job_id)
            )
            job = job_result.scalar_one_or_none()
            
            if job and job.protein_file_path and os.path.exists(job.protein_file_path):
                with open(job.protein_file_path, 'r') as f:
                    pdbqt_content = f.read()
                print(f"✅ Loaded protein from job path: {job.protein_file_path}")
            elif protein.original_file_path and os.path.exists(protein.original_file_path):
                with open(protein.original_file_path, 'r') as f:
                    pdb_content = f.read()
            elif protein.prepared_pdbqt_path and os.path.exists(protein.prepared_pdbqt_path):
                with open(protein.prepared_pdbqt_path, 'r') as f:
                    pdbqt_content = f.read()
        
        if not pdb_content and not pdbqt_content:
            # Return a simple fallback response instead of 404
            return {
                "protein_id": str(protein.id) if protein else "unknown",
                "protein_name": protein.name if protein else "Unknown Protein",
                "pdb_id": protein.pdb_id if protein else None,
                "pdb_content": None,
                "pdbqt_content": None,
                "binding_site": {
                    "center_x": job.center_x if job else 0,
                    "center_y": job.center_y if job else 0,
                    "center_z": job.center_z if job else 0,
                    "size_x": job.size_x if job else 20,
                    "size_y": job.size_y if job else 20,
                    "size_z": job.size_z if job else 20
                },
                "error": "Protein structure file not available for visualization"
            }
        
        return {
            "protein_id": str(protein.id),
            "protein_name": protein.name,
            "pdb_id": protein.pdb_id,
            "pdb_content": pdb_content,
            "pdbqt_content": pdbqt_content,
            "binding_site": {
                "center_x": job.center_x,
                "center_y": job.center_y,
                "center_z": job.center_z,
                "size_x": job.size_x,
                "size_y": job.size_y,
                "size_z": job.size_z
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get protein structure: {str(e)}"
        )


@router.get("/poses/{ligand_id}")
async def get_ligand_poses_with_affinities(
    ligand_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get all ligand poses with their binding affinities."""
    try:
        # Get ligand
        ligand_result = await db.execute(select(Ligand).where(Ligand.id == ligand_id))
        ligand = ligand_result.scalar_one_or_none()
        
        if not ligand:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ligand not found"
            )
        
        # Parse affinities from log file
        from app.core.config import settings
        log_path = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}_log.txt")
        poses_with_affinities = []
        
        if os.path.exists(log_path):
            poses_with_affinities = parse_gnina_log(log_path)
        
        # If no log file, try to extract from database
        if not poses_with_affinities:
            docking_results = await db.execute(
                select(DockingResult)
                .where(DockingResult.ligand_id == ligand_id)
                .order_by(DockingResult.binding_affinity)
            )
            results = docking_results.scalars().all()
            
            for i, result in enumerate(results):
                poses_with_affinities.append({
                    "pose_index": i,
                    "binding_affinity": result.binding_affinity,
                    "intramol_energy": None,
                    "cnn_score": None,
                    "mode": result.mode
                })
        
        return {
            "ligand_id": str(ligand_id),
            "ligand_name": ligand.name,
            "poses": poses_with_affinities
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get poses: {str(e)}"
        )

@router.get("/complex/{ligand_id}")
async def get_protein_ligand_complex(
    ligand_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get protein-ligand complex for visualization."""
    try:
        from app.database import Protein
        
        # Get ligand and its job
        ligand_result = await db.execute(select(Ligand).where(Ligand.id == ligand_id))
        ligand = ligand_result.scalar_one_or_none()
        
        if not ligand:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ligand not found"
            )
        
        # Get protein for the same job
        protein_result = await db.execute(
            select(Protein).where(Protein.job_id == ligand.job_id)
        )
        protein = protein_result.scalar_one_or_none()
        
        if not protein:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Protein not found for this ligand"
            )
        
        # Get best docking result
        docking_result = await db.execute(
            select(DockingResult)
            .where(DockingResult.ligand_id == ligand_id)
            .order_by(DockingResult.binding_affinity)
            .limit(1)
        )
        result = docking_result.scalar_one_or_none()
        
        # Read protein structure from temp directory first
        from app.core.config import settings
        protein_content = None
        temp_protein_path = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "receptor.pdbqt")
        if os.path.exists(temp_protein_path):
            with open(temp_protein_path, 'r') as f:
                protein_content = f.read()
        else:
            # Try to get protein path from job  
            job_result = await db.execute(
                select(ScreeningJob).where(ScreeningJob.id == ligand.job_id)
            )
            job = job_result.scalar_one_or_none()
            
            if job and job.protein_file_path and os.path.exists(job.protein_file_path):
                with open(job.protein_file_path, 'r') as f:
                    protein_content = f.read()
            elif protein.original_file_path and os.path.exists(protein.original_file_path):
                with open(protein.original_file_path, 'r') as f:
                    protein_content = f.read()
        
        # Read docked ligand structure from temp directory first
        ligand_content = None
        binding_affinity = None

        # Try with ligand_id first
        temp_docked_path = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}.pdbqt")
        if os.path.exists(temp_docked_path):
            with open(temp_docked_path, 'r') as f:
                ligand_content = f.read()
            if result:
                binding_affinity = result.binding_affinity
        else:
            # Try with ligand name if available
            if ligand.name:
                clean_name = ligand.name.replace(' ', '_').replace('/', '_').replace('\\', '_').replace('<', '').replace('>', '')
                temp_docked_path_name = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_name}.pdbqt")
                if os.path.exists(temp_docked_path_name):
                    with open(temp_docked_path_name, 'r') as f:
                        ligand_content = f.read()
                    if result:
                        binding_affinity = result.binding_affinity
                else:
                    # Try extracting name from content
                    if ligand.prepared_structure_path and os.path.exists(ligand.prepared_structure_path):
                        try:
                            with open(ligand.prepared_structure_path, 'r') as f:
                                content = f.read()
                            extracted_name = _extract_molecule_name(content)
                            if extracted_name:
                                clean_extracted = extracted_name.replace(' ', '_').replace('/', '_').replace('\\', '_').replace('<', '').replace('>', '')
                                temp_path_extracted = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_extracted}.pdbqt")
                                if os.path.exists(temp_path_extracted):
                                    with open(temp_path_extracted, 'r') as f:
                                        ligand_content = f.read()
                                    if result:
                                        binding_affinity = result.binding_affinity
                        except Exception as e:
                            print(f"❌ Error extracting name for complex: {e}")
        
        # If not found in temp directory, try original paths
        if not ligand_content and result and result.output_pdbqt_path and os.path.exists(result.output_pdbqt_path):
            with open(result.output_pdbqt_path, 'r') as f:
                ligand_content = f.read()
            binding_affinity = result.binding_affinity
        elif not ligand_content and ligand.pdbqt_path and os.path.exists(ligand.pdbqt_path):
            with open(ligand.pdbqt_path, 'r') as f:
                ligand_content = f.read()
        
        if not protein_content or not ligand_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Structure files not available for complex visualization"
            )
        
        return {
            "ligand_id": str(ligand_id),
            "ligand_name": ligand.name,
            "protein_name": protein.name,
            "protein_content": protein_content,
            "ligand_content": ligand_content,
            "binding_affinity": binding_affinity,
            "docking_mode": result.mode if result else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get complex: {str(e)}"
        )


def parse_gnina_log(log_path: str) -> list:
    """Parse GNINA log file to extract all poses with their affinities."""
    poses = []
    
    try:
        with open(log_path, 'r') as f:
            content = f.read()
        
        # Look for the results table in the log
        lines = content.split('\n')
        in_results_table = False
        
        for line in lines:
            line = line.strip()
            
            # Check if we're entering the results table
            if 'mode |  affinity  |  intramol  |    CNN' in line:
                in_results_table = True
                continue
            
            # Skip separator lines
            if in_results_table and ('----' in line or '====' in line or not line):
                continue
            
            # Parse result lines
            if in_results_table and line:
                # Stop if we hit another section
                if line.startswith('Refining'):
                    break
                
                try:
                    # Expected format: "   1      -8.123      0.456     0.789"
                    parts = line.split()
                    if len(parts) >= 4 and parts[0].isdigit():
                        pose_index = int(parts[0]) - 1  # Convert to 0-based index
                        affinity = float(parts[1])
                        intramol = float(parts[2]) if parts[2] != 'nan' else None
                        cnn_score = float(parts[3]) if parts[3] != 'nan' else None
                        
                        poses.append({
                            "pose_index": pose_index,
                            "binding_affinity": affinity,
                            "intramol_energy": intramol,
                            "cnn_score": cnn_score,
                            "mode": pose_index + 1
                        })
                except (ValueError, IndexError):
                    # Skip lines that don't match expected format
                    continue
    
    except Exception as e:
        print(f"Error parsing GNINA log file {log_path}: {e}")
    
    return poses

@router.get("/download/{ligand_id}/{pose_index}")
async def download_pose(
    ligand_id: UUID,
    pose_index: int,
    format: str = "pdbqt",
    db: AsyncSession = Depends(get_db)
):
    """Download specific pose of a ligand in requested format."""
    try:
        from fastapi.responses import Response
        from app.core.config import settings

        # Get ligand
        ligand_result = await db.execute(select(Ligand).where(Ligand.id == ligand_id))
        ligand = ligand_result.scalar_one_or_none()

        if not ligand:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ligand not found"
            )

        # Read the docked structure file - try multiple paths
        docked_path = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}.pdbqt")

        if not os.path.exists(docked_path):
            # Try .sdf extension
            docked_path = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{ligand_id}.sdf")

        if not os.path.exists(docked_path):
            # Try with ligand name
            if ligand.name:
                clean_name = ligand.name.replace(' ', '_').replace('/', '_').replace('\\', '_').replace('<', '').replace('>', '')
                docked_path = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_name}.pdbqt")

                if not os.path.exists(docked_path):
                    # Try .sdf with name
                    docked_path = os.path.join(settings.TEMP_DIR, str(ligand.job_id), "docking_outputs", f"{clean_name}.sdf")

        if not os.path.exists(docked_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Docked structure file not found for ligand {ligand_id}"
            )
        
        # Extract specific pose from multi-model PDBQT file
        pose_content = extract_pose_from_pdbqt(docked_path, pose_index)
        
        if not pose_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pose {pose_index} not found"
            )
        
        # Set filename and content type based on format
        if format.lower() == "pdb":
            filename = f"{ligand.name or f'ligand_{ligand_id}'}_pose_{pose_index + 1}.pdb"
            # Convert PDBQT to PDB by removing TORSDOF and ROOT/ENDROOT lines
            pdb_content = convert_pdbqt_to_pdb(pose_content)
            content_type = "chemical/x-pdb"
            return Response(
                content=pdb_content,
                media_type=content_type,
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        else:
            filename = f"{ligand.name or f'ligand_{ligand_id}'}_pose_{pose_index + 1}.pdbqt"
            content_type = "chemical/x-pdbqt"
            return Response(
                content=pose_content,
                media_type=content_type,
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download pose: {str(e)}"
        )

def extract_pose_from_pdbqt(file_path: str, pose_index: int) -> str:
    """Extract specific pose from multi-model PDBQT file."""
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Split by MODEL sections
        models = []
        current_model = []
        in_model = False
        
        for line in content.split('\n'):
            if line.startswith('MODEL'):
                if current_model and in_model:
                    models.append('\n'.join(current_model))
                current_model = [line]
                in_model = True
            elif line.startswith('ENDMDL'):
                if in_model:
                    current_model.append(line)
                    models.append('\n'.join(current_model))
                    current_model = []
                    in_model = False
            elif in_model:
                current_model.append(line)
        
        # If no MODEL/ENDMDL tags, treat as single model
        if not models and content.strip():
            models = [content]
        
        # Return requested pose
        if 0 <= pose_index < len(models):
            return models[pose_index]
        
        return None
        
    except Exception as e:
        print(f"Error extracting pose {pose_index} from {file_path}: {e}")
        return None

def convert_pdbqt_to_pdb(pdbqt_content: str) -> str:
    """Convert PDBQT content to PDB format by removing PDBQT-specific lines."""
    lines = pdbqt_content.split('\n')
    pdb_lines = []
    
    for line in lines:
        # Skip PDBQT-specific lines
        if (line.startswith('ROOT') or 
            line.startswith('ENDROOT') or 
            line.startswith('BRANCH') or 
            line.startswith('ENDBRANCH') or 
            line.startswith('TORSDOF') or
            line.startswith('MODEL') or
            line.startswith('ENDMDL')):
            continue
        
        # Keep standard PDB lines
        if (line.startswith('ATOM') or 
            line.startswith('HETATM') or 
            line.startswith('CONECT') or
            line.startswith('REMARK') or
            line.startswith('HEADER') or
            line.startswith('END')):
            pdb_lines.append(line)
    
    return '\n'.join(pdb_lines)

def _extract_molecule_name(content: str) -> str:
    """Extract molecule name from file content, skip CDX names."""
    lines = content.split('\n')
    for line in lines:
        if '<Name>' in line:
            # Extract name between <Name> tags
            start = line.find('<Name>') + 6
            end = line.find('</Name>')
            if end > start:
                potential_name = line[start:end].strip()
                # Skip if name ends with .cdx (incorrect name)
                if not potential_name.lower().endswith('.cdx'):
                    return potential_name
        # Also check for REMARK Name format
        if line.strip().startswith('REMARK') and 'Name =' in line:
            name_part = line.split('Name =')[1].strip()
            # Skip if name ends with .cdx (incorrect name)
            if not name_part.lower().endswith('.cdx'):
                return name_part
    return None

async def _convert_to_pdb_content(file_path: str) -> str:
    """Convert structure file to PDB format for visualization."""
    try:
        file_extension = os.path.splitext(file_path)[1].lower()
        
        if file_extension == '.pdb':
            with open(file_path, 'r') as f:
                return f.read()
        
        elif file_extension in ['.sdf', '.mol', '.mol2']:
            # Use OpenBabel to convert to PDB
            import subprocess
            import tempfile
            
            with tempfile.NamedTemporaryFile(mode='w', suffix='.pdb', delete=False) as temp_pdb:
                temp_pdb_path = temp_pdb.name
            
            try:
                from app.core.config import settings
                subprocess.run([
                    settings.OBABEL_PATH,
                    '-i' + file_extension[1:],  # Remove the dot
                    file_path,
                    '-opdb',
                    '-O', temp_pdb_path
                ], check=True, capture_output=True, text=True)
                
                with open(temp_pdb_path, 'r') as f:
                    pdb_content = f.read()
                
                return pdb_content
                
            finally:
                if os.path.exists(temp_pdb_path):
                    os.remove(temp_pdb_path)
        
        else:
            # Try to read as text (might be PDBQT or other format)
            with open(file_path, 'r') as f:
                return f.read()
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to convert structure file: {str(e)}"
        )