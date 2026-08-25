"""
Docking service that integrates your existing parallel docking code.
"""

import os
import glob
import subprocess
import time
import logging
import shutil
from pathlib import Path
from typing import Dict, Any, List, Callable, Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.core.config import settings
from app.services.gnina_local_service import gnina_local_service

logger = logging.getLogger(__name__)


class DockingService:
    """Service for running molecular docking with GNINA."""
    
    def __init__(self):
        self.temp_dir = Path(settings.TEMP_DIR)
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"🔧 DockingService initialized with temp_dir: {self.temp_dir}")
    
    async def run_parallel_docking(
        self,
        ligands_file: str,
        protein_file: str,
        job_id: str,
        docking_params: Dict[str, Any],
        max_workers: Optional[int] = None,
        cores_per_job: int = 8,
        progress_callback: Optional[Callable] = None,
        ref_ligand_file: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Run parallel molecular docking.
        Based on your 3_run_docking_parallel_optimized.py script.
        """
        logger.info(f"🎯 Starting parallel molecular docking for job {job_id}")
        
        job_dir = self.temp_dir / job_id
        docking_dir = job_dir / "docking_outputs"
        ligands_pdbqt_dir = docking_dir / "ligands_pdbqt" 
        
        # Create directories with parent directories
        logger.info(f"📁 Creating job directory: {job_dir}")
        job_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 Creating docking directory: {docking_dir}")
        docking_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 Creating ligands directory: {ligands_pdbqt_dir}")
        ligands_pdbqt_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Validate input files
            if not os.path.exists(ligands_file):
                raise FileNotFoundError(f"Ligands file not found: {ligands_file}")
            
            if not os.path.exists(protein_file):
                raise FileNotFoundError(f"Protein file not found: {protein_file}")
            
            # Extract drug names from SDF file
            logger.info("   📋 Extracting drug names from SDF file...")
            drug_names = await self._extract_drug_names_from_sdf(ligands_file)
            logger.info(f"   📊 Found names for {len(drug_names)} drugs")
            
            # Convert ligands to PDBQT format
            logger.info("   🔄 Converting ligands from SDF to PDBQT...")
            await self._convert_ligands_to_pdbqt(ligands_file, ligands_pdbqt_dir)
            
            # Get ligand files for docking
            ligand_files = sorted(glob.glob(str(ligands_pdbqt_dir / "mol_*.pdbqt")))

            if not ligand_files:
                raise RuntimeError("No ligand PDBQT files found for docking")

            logger.info(f"   🎯 Found {len(ligand_files)} ligands for parallel processing...")

            # Check for existing docking results to enable resume functionality
            from app.database.connection import get_sync_database
            from app.database.models import DockingResult, Ligand
            from sqlalchemy import select

            existing_results = set()
            total_ligands = len(ligand_files)

            try:
                with get_sync_database() as db:
                    # Get ligands that already have docking results
                    result = db.execute(
                        select(Ligand.original_index)
                        .join(DockingResult, Ligand.id == DockingResult.ligand_id)
                        .where(Ligand.job_id == job_id)
                    )
                    existing_results = {row[0] for row in result.fetchall()}

                    if existing_results:
                        logger.info(f"   📊 Resume mode: Found {len(existing_results)} ligands already processed")

            except Exception as e:
                logger.warning(f"Could not check existing results: {e}")
                existing_results = set()

            # Create GNINA configuration file
            config_file = await self._create_gnina_config(job_dir, docking_params)
            
            # Set up parallel processing parameters
            if max_workers is None:
                import multiprocessing
                max_workers = min(settings.MAX_WORKERS_PER_JOB, multiprocessing.cpu_count())
            
            cores_per_job = min(cores_per_job, settings.CORES_PER_GNINA_JOB)
            # Ensure at least 2 cores per GNINA job for better performance
            cores_per_job = max(cores_per_job, 8)
            
            logger.info(f"   🏭 Using {max_workers} workers, {cores_per_job} cores per GNINA job")
            
            # Prepare job arguments, skipping already processed ligands
            job_args = []
            skipped_count = 0

            for i, ligand_file in enumerate(ligand_files):
                base_name = os.path.basename(ligand_file)
                ligand_id = os.path.splitext(base_name)[0]  # e.g., "mol_1"

                # Extract the original index from mol_X pattern
                try:
                    original_index = int(ligand_id.split("_")[1])
                except (ValueError, IndexError):
                    original_index = i + 1  # fallback to position-based index

                # Skip if already processed
                if original_index in existing_results:
                    skipped_count += 1
                    logger.debug(f"   ⏭️ Skipping already processed ligand: {ligand_id}")
                    continue

                drug_name = drug_names.get(ligand_id, f"Unknown_Drug_{i+1}")

                job_args.append((
                    ligand_file,
                    protein_file,
                    config_file,
                    drug_name,
                    ligand_id,
                    cores_per_job,
                    str(docking_dir),
                    ref_ligand_file
                ))

            if skipped_count > 0:
                logger.info(f"   ⏭️ Skipped {skipped_count} already processed ligands")

            logger.info(f"   🎯 Processing {len(job_args)} remaining ligands out of {total_ligands} total")
            
            # Create progress callback wrapper that accounts for already processed ligands
            def adjusted_progress_callback(progress_info):
                if progress_callback:
                    adjusted_completed = progress_info.get('completed', 0) + len(existing_results)
                    adjusted_percentage = (adjusted_completed / total_ligands) * 100

                    adjusted_progress_info = {
                        'completed': adjusted_completed,
                        'total': total_ligands,
                        'percentage': adjusted_percentage,
                        'status': progress_info.get('status', f'Processing {adjusted_completed}/{total_ligands}')
                    }
                    progress_callback(adjusted_progress_info)

            # Run docking in parallel using ThreadPoolExecutor (Celery-compatible)
            results = await self._run_docking_threadpool(
                job_args, max_workers, adjusted_progress_callback
            )
            
            # Process results
            successful_results = [r for r in results if r["success"]]
            failed_results = [r for r in results if not r["success"]]
            
            logger.info(f"✅ Docking completed: {len(successful_results)} successful, {len(failed_results)} failed")
            
            return {
                "success": True,
                "results": results,
                "summary": {
                    "total_ligands": len(ligand_files),
                    "successful": len(successful_results),
                    "failed": len(failed_results),
                    "success_rate": len(successful_results) / len(ligand_files) * 100
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Docking failed: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "results": []
            }
    
    async def _extract_drug_names_from_sdf(self, sdf_file: str) -> Dict[str, str]:
        """Extract drug names from SDF file."""
        drug_names = {}
        
        try:
            # Try RDKit first
            try:
                from rdkit import Chem
                
                suppl = Chem.SDMolSupplier(sdf_file)
                
                for i, mol in enumerate(suppl):
                    if mol is None:
                        continue
                    
                    mol_index = i + 1
                    drug_name = None
                    
                    # Only use Name tag from RDKit, ignore CDX names
                    prop_names = mol.GetPropNames()
                    
                    if 'Name' in prop_names:
                        try:
                            drug_name = mol.GetProp('Name').strip()
                            # Skip if name ends with .cdx (incorrect name)
                            if drug_name.lower().endswith('.cdx'):
                                drug_name = None
                        except:
                            drug_name = None
                    
                    if not drug_name:
                        drug_name = f"Unknown_Drug_{mol_index}"
                    
                    drug_names[f"mol_{mol_index}"] = drug_name
                
                return drug_names
                
            except ImportError:
                logger.warning("RDKit not available, using manual SDF parsing")
                
            # Manual parsing fallback
            with open(sdf_file, 'r') as f:
                content = f.read()
            
            molecules = content.split('$')
            
            for i, mol_block in enumerate(molecules):
                if mol_block.strip():
                    drug_name = None
                    
                    lines = mol_block.strip().split('\n')
                    for j, line in enumerate(lines):
                        if line.strip() == '>  <Name>':
                            if j + 1 < len(lines):
                                potential_name = lines[j + 1].strip()
                                # Skip if name ends with .cdx (incorrect name)
                                if not potential_name.lower().endswith('.cdx'):
                                    drug_name = potential_name
                                break
                    
                    if not drug_name or drug_name == '':
                        drug_name = f"Unknown_Drug_{i+1}"
                    
                    drug_names[f"mol_{i+1}"] = drug_name
            
            return drug_names
            
        except Exception as e:
            logger.warning(f"Could not extract drug names: {e}")
            return {}
    
    async def _find_obabel_executable(self) -> Optional[str]:
        """Find OpenBabel executable by trying different common paths."""
        # List of possible executable names and paths to try
        possible_paths = [
            settings.OBABEL_PATH,  # From config/environment
            os.getenv("OBABEL_PATH"),  # Environment variable
            "obabel",              # Standard name
            "obabel.exe",          # Windows executable
            "/usr/bin/obabel",     # Linux standard
            "/usr/local/bin/obabel",  # MacOS/Linux alternative
            "/home/amqa/openbabel-3.1.1/build/bin/obabel",  # Your specific path first
            "C:/Program Files/OpenBabel/bin/obabel.exe",  # Windows common install
            "C:/OpenBabel/bin/obabel.exe",  # Windows alternative
        ]
        
        # Filter out None values
        possible_paths = [path for path in possible_paths if path]
        
        for path in possible_paths:
            try:
                # Make sure the path is executable
                if os.path.exists(path) and os.access(path, os.X_OK):
                    # Test the executable with different version commands
                    version_commands = ["--version", "-V", "--help"]
                    
                    for version_cmd in version_commands:
                        try:
                            result = subprocess.run([path, version_cmd], 
                                                  capture_output=True, text=True, timeout=10,
                                                  env=os.environ.copy())
                            if result.returncode == 0:
                                logger.info(f"✅ Found OpenBabel at: {path}")
                                logger.info(f"OpenBabel response: {result.stdout[:100].strip()}...")
                                return path
                        except Exception:
                            continue
                    
                    # If all version commands failed, just assume it works if file exists and is executable
                    logger.info(f"⚠️ OpenBabel at {path} exists and is executable (version check failed)")
                    return path
                elif os.path.exists(path):
                    logger.warning(f"❌ OpenBabel at {path} exists but not executable")
                else:
                    logger.debug(f"❌ OpenBabel path does not exist: {path}")
            except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
                logger.debug(f"❌ Could not test OpenBabel at {path}: {e}")
                continue
        
        logger.error("OpenBabel not found in any of the expected locations")
        logger.info("Please install OpenBabel or set OBABEL_PATH environment variable")
        logger.info(f"Tried paths: {possible_paths}")
        return None
    
    async def _find_gnina_executable(self) -> Optional[str]:
        """Find GNINA executable by trying different common paths."""
        possible_paths = [
            settings.GNINA_PATH,   # From config/environment
            "gnina",               # Standard name
            "gnina.exe",          # Windows executable
            "/usr/bin/gnina",     # Linux standard
            "/usr/local/bin/gnina", # MacOS/Linux alternative
            "/home/amqa/gnina/build/gnina",  # Custom build path
            "C:/Program Files/GNINA/bin/gnina.exe",  # Windows common install
            "C:/gnina/gnina.exe", # Windows alternative
        ]
        
        for path in possible_paths:
            try:
                result = subprocess.run([path, "--help"], 
                                      capture_output=True, text=True, timeout=10)
                if result.returncode == 0 or ("gnina" in result.stdout.lower() or "autodock" in result.stdout.lower()):
                    logger.info(f"Found GNINA at: {path}")
                    return path
            except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
                continue
        
        logger.error("GNINA not found in any of the expected locations")
        logger.info("Please install GNINA or set GNINA_PATH environment variable")
        logger.info(f"Tried paths: {possible_paths}")
        return None
    
    async def _create_gnina_config(self, job_dir: Path, docking_params: Dict[str, Any]) -> str:
        """Create GNINA configuration file with binding site parameters."""
        config_file = job_dir / "gnina_config.conf"
        
        # Extract parameters with defaults
        center_x = docking_params.get("center_x", 15.2)
        center_y = docking_params.get("center_y", 18.7)
        center_z = docking_params.get("center_z", 12.3)
        size_x = docking_params.get("size_x", 20.0)
        size_y = docking_params.get("size_y", 20.0)
        size_z = docking_params.get("size_z", 20.0)
        exhaustiveness = docking_params.get("exhaustiveness", 32)
        num_modes = docking_params.get("num_modes", 9)
        
        config_content = f"""# GNINA configuration file
# Generated automatically by Virtual Screening App

# Binding site center coordinates
center_x = {center_x}
center_y = {center_y}  
center_z = {center_z}

# Binding site dimensions
size_x = {size_x}
size_y = {size_y}
size_z = {size_z}

# Search parameters
exhaustiveness = {exhaustiveness}
num_modes = {num_modes}

# Minimization
minimize = 1
"""
        
        with open(config_file, 'w') as f:
            f.write(config_content)
        
        logger.info(f"✅ Created GNINA config file: {config_file}")
        logger.info(f"   Binding site: ({center_x}, {center_y}, {center_z})")
        logger.info(f"   Search box: {size_x} x {size_y} x {size_z}")
        logger.info(f"   Exhaustiveness: {exhaustiveness}, Modes: {num_modes}")
        
        return str(config_file)
    
    async def _convert_ligands_to_pdbqt(self, sdf_file: str, output_dir: Path) -> None:
        """Convert SDF ligands to individual PDBQT files."""
        
        # Try to find OpenBabel executable
        obabel_path = await self._find_obabel_executable()
        if not obabel_path:
            raise FileNotFoundError("OpenBabel executable not found. Please install OpenBabel or set OBABEL_PATH environment variable.")
        
        logger.info(f"Using OpenBabel at: {obabel_path}")
        
        command = [
            obabel_path,
            "-isdf", str(sdf_file),
            "-opdbqt",
            "-m",
            "-O", str(output_dir / "mol_.pdbqt")
        ]
        
        logger.info(f"Running OpenBabel command: {' '.join(command)}")
        # Pass current environment to subprocess
        env = os.environ.copy()
        result = subprocess.run(command, capture_output=True, text=True, timeout=300, env=env)
        
        if result.returncode != 0:
            logger.error(f"OpenBabel failed: {result.stderr}")
            raise subprocess.CalledProcessError(
                result.returncode, command, stderr=result.stderr
            )
        
        logger.info(f"OpenBabel output: {result.stdout}")
        
        # Verify output files were created
        pdbqt_files = list(output_dir.glob("mol_*.pdbqt"))
        if not pdbqt_files:
            logger.error("No PDBQT files were generated by OpenBabel")
            raise RuntimeError("OpenBabel did not generate any PDBQT files")
    
    async def _create_vina_config(self, job_dir: Path, params: Dict[str, Any]) -> str:
        """Create AutoDock Vina configuration file."""
        config_file = job_dir / "vina_config.txt"
        
        # Optimize parameters to prevent timeout
        if settings.VINA_FAST_MODE:
            exhaustiveness = min(int(params.get('exhaustiveness', 32)), 32)  # Fast mode: lower exhaustiveness
            num_modes = min(int(params.get('num_modes', 5)), 10)  # Fast mode: fewer modes
        else:
            exhaustiveness = min(int(params.get('exhaustiveness', 32)), settings.VINA_MAX_EXHAUSTIVENESS)
            num_modes = min(int(params.get('num_modes', 9)), 20)
        
        # Ensure reasonable search space
        max_size = settings.VINA_MAX_SEARCH_SIZE if not settings.VINA_FAST_MODE else 25
        size_x = min(float(params.get('size_x', 20)), max_size)
        size_y = min(float(params.get('size_y', 20)), max_size) 
        size_z = min(float(params.get('size_z', 20)), max_size)
        
        config_content = f"""# AutoDock Vina Configuration File
# Binding site center coordinates (Angstroms)
center_x = {params['center_x']}
center_y = {params['center_y']}
center_z = {params['center_z']}

# Search space size (Angstroms) - optimized for speed
size_x = {size_x}
size_y = {size_y}
size_z = {size_z}

# Number of binding modes to generate - optimized for speed
num_modes = {num_modes}

# Energy range for binding modes (kcal/mol)
energy_range = 3

# Exhaustiveness of search - optimized for speed  
exhaustiveness = {exhaustiveness}
"""
        
        logger = logging.getLogger(__name__)
        logger.info(f"🔧 Vina config: exhaustiveness={exhaustiveness}, num_modes={num_modes}, search_space={size_x}x{size_y}x{size_z}")
        
        with open(config_file, 'w') as f:
            f.write(config_content)
        
        return str(config_file)
    
    async def _run_docking_threadpool(
        self,
        job_args: List[tuple],
        max_workers: int,
        progress_callback: Optional[Callable] = None
    ) -> List[Dict[str, Any]]:
        """Run docking jobs in parallel using ThreadPoolExecutor (Celery-compatible)."""
        
        results = []
        completed = 0
        total = len(job_args)
        
        # Use ThreadPoolExecutor instead of multiprocessing Pool
        # This avoids the daemon process issue with Celery workers
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all jobs to the thread pool
            future_to_args = {
                executor.submit(process_single_ligand, args): args 
                for args in job_args
            }
            
            # Process completed jobs as they finish
            for future in as_completed(future_to_args):
                try:
                    result = future.result()
                    results.append(result)
                    completed += 1
                    
                    # Call progress callback if provided
                    if progress_callback:
                        try:
                            progress_info = {
                                "completed": completed,
                                "total": total,
                                "percentage": (completed / total) * 100
                            }
                            progress_callback(progress_info)
                        except Exception as e:
                            logger.warning(f"Progress callback failed: {e}")
                            
                except Exception as e:
                    # Handle individual job failures
                    args = future_to_args[future]
                    drug_name = args[3] if len(args) > 3 else "Unknown"
                    ligand_id = args[4] if len(args) > 4 else "Unknown"
                    logger.error(f"❌ Thread job failed for {drug_name} ({ligand_id}): {e}")
                    import traceback
                    logger.error(f"   Traceback: {traceback.format_exc()}")
                    results.append({
                        "success": False,
                        "drug_name": drug_name,
                        "ligand_id": ligand_id,
                        "error": f"Thread execution error: {str(e)}"
                    })
                    completed += 1
        
        return results

    def run_parallel_docking_sync(
        self,
        ligands_file: str,
        protein_file: str,
        job_id: str,
        docking_params: Dict[str, Any],
        max_workers: Optional[int] = None,
        cores_per_job: int = 8,
        progress_callback: Optional[Callable] = None,
        ref_ligand_file: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Synchronous version of run_parallel_docking for use in Celery workers.
        """
        logger.info(f"🎯 Starting synchronous parallel molecular docking for job {job_id}")

        job_dir = self.temp_dir / job_id
        docking_dir = job_dir / "docking_outputs"
        ligands_pdbqt_dir = docking_dir / "ligands_pdbqt"

        # Create directories with parent directories
        logger.info(f"📁 Creating job directory: {job_dir}")
        job_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 Creating docking directory: {docking_dir}")
        docking_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 Creating ligands directory: {ligands_pdbqt_dir}")
        ligands_pdbqt_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Validate input files
            if not os.path.exists(ligands_file):
                raise FileNotFoundError(f"Ligands file not found: {ligands_file}")

            if not os.path.exists(protein_file):
                raise FileNotFoundError(f"Protein file not found: {protein_file}")

            # Extract drug names from SDF file (sync version)
            logger.info("   📋 Extracting drug names from SDF file...")
            drug_names = self._extract_drug_names_from_sdf_sync(ligands_file)
            logger.info(f"   📊 Found names for {len(drug_names)} drugs")

            # Convert ligands to PDBQT format (sync version)
            logger.info("   🔄 Converting ligands from SDF to PDBQT...")
            self._convert_ligands_to_pdbqt_sync(ligands_file, ligands_pdbqt_dir)

            # Get ligand files for docking
            ligand_files = sorted(glob.glob(str(ligands_pdbqt_dir / "mol_*.pdbqt")))

            if not ligand_files:
                raise RuntimeError("No ligand PDBQT files found for docking")

            logger.info(f"   🎯 Found {len(ligand_files)} ligands for parallel processing...")

            # Check for existing docking results to enable resume functionality
            from app.database.connection import get_sync_database
            from app.database.models import DockingResult, Ligand
            from sqlalchemy import select

            existing_results = set()
            total_ligands = len(ligand_files)

            try:
                with get_sync_database() as db:
                    # Get ligands that already have docking results
                    result = db.execute(
                        select(Ligand.original_index)
                        .join(DockingResult, Ligand.id == DockingResult.ligand_id)
                        .where(Ligand.job_id == job_id)
                    )
                    existing_results = {row[0] for row in result.fetchall()}

                    if existing_results:
                        logger.info(f"   📊 Resume mode: Found {len(existing_results)} ligands already processed")

            except Exception as e:
                logger.warning(f"Could not check existing results: {e}")
                existing_results = set()

            # Create GNINA configuration file (sync version)
            config_file = self._create_gnina_config_sync(job_dir, docking_params)

            # Set up parallel processing parameters
            if max_workers is None:
                import multiprocessing
                max_workers = min(settings.MAX_WORKERS_PER_JOB, multiprocessing.cpu_count())

            cores_per_job = min(cores_per_job, settings.CORES_PER_GNINA_JOB)
            # Ensure at least 2 cores per GNINA job for better performance
            cores_per_job = max(cores_per_job, 8)

            logger.info(f"   🏭 Using {max_workers} workers, {cores_per_job} cores per GNINA job")

            # Prepare job arguments, skipping already processed ligands
            job_args = []
            skipped_count = 0

            for i, ligand_file in enumerate(ligand_files):
                base_name = os.path.basename(ligand_file)
                ligand_id = os.path.splitext(base_name)[0]  # e.g., "mol_1"

                # Extract the original index from mol_X pattern
                try:
                    original_index = int(ligand_id.split("_")[1])
                except (ValueError, IndexError):
                    original_index = i + 1  # fallback to position-based index

                # Skip if already processed
                if original_index in existing_results:
                    skipped_count += 1
                    logger.debug(f"   ⏭️ Skipping already processed ligand: {ligand_id}")
                    continue

                drug_name = drug_names.get(ligand_id, f"Unknown_Drug_{i+1}")

                job_args.append((
                    ligand_file,
                    protein_file,
                    config_file,
                    drug_name,
                    ligand_id,
                    cores_per_job,
                    str(docking_dir),
                    ref_ligand_file
                ))

            if skipped_count > 0:
                logger.info(f"   ⏭️ Skipped {skipped_count} already processed ligands")

            logger.info(f"   🎯 Processing {len(job_args)} remaining ligands out of {total_ligands} total")

            # Create progress callback wrapper that accounts for already processed ligands
            def adjusted_progress_callback(progress_info):
                if progress_callback:
                    adjusted_completed = progress_info.get('completed', 0) + len(existing_results)
                    adjusted_percentage = (adjusted_completed / total_ligands) * 100

                    adjusted_progress_info = {
                        'completed': adjusted_completed,
                        'total': total_ligands,
                        'percentage': adjusted_percentage,
                        'status': progress_info.get('status', f'Processing {adjusted_completed}/{total_ligands}')
                    }
                    progress_callback(adjusted_progress_info)

            # Run docking in parallel using ThreadPoolExecutor (Celery-compatible)
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                results = loop.run_until_complete(self._run_docking_threadpool(
                    job_args, max_workers, adjusted_progress_callback
                ))
            finally:
                loop.close()

            # Process results
            successful_results = [r for r in results if r["success"]]
            failed_results = [r for r in results if not r["success"]]

            logger.info(f"✅ Docking completed: {len(successful_results)} successful, {len(failed_results)} failed")

            return {
                "success": True,
                "results": results,
                "summary": {
                    "total_ligands": len(ligand_files),
                    "successful": len(successful_results),
                    "failed": len(failed_results),
                    "success_rate": len(successful_results) / len(ligand_files) * 100
                }
            }

        except Exception as e:
            logger.error(f"❌ Docking failed: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "results": []
            }

    def _extract_drug_names_from_sdf_sync(self, sdf_file: str) -> Dict[str, str]:
        """Synchronous version of extract_drug_names_from_sdf."""
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(self._extract_drug_names_from_sdf(sdf_file))
        finally:
            loop.close()

    def _convert_ligands_to_pdbqt_sync(self, sdf_file: str, output_dir: Path) -> None:
        """Synchronous version of convert_ligands_to_pdbqt."""
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._convert_ligands_to_pdbqt(sdf_file, output_dir))
        finally:
            loop.close()

    def _create_gnina_config_sync(self, job_dir: Path, docking_params: Dict[str, Any]) -> str:
        """Synchronous version of create_gnina_config."""
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(self._create_gnina_config(job_dir, docking_params))
        finally:
            loop.close()


def find_gnina_executable_sync() -> Optional[str]:
    """Synchronous version of GNINA finding for multiprocessing."""
    import subprocess
    from app.core.config import settings
    
    possible_paths = [
        settings.GNINA_PATH,   # From config/environment
        "gnina",               # Standard name
        "gnina.exe",          # Windows executable
        "/usr/bin/gnina",     # Linux standard
        "/usr/local/bin/gnina", # MacOS/Linux alternative
        "/home/amqa/gnina/build/gnina",  # Custom build path
        "C:/Program Files/GNINA/bin/gnina.exe",  # Windows common install
        "C:/gnina/gnina.exe", # Windows alternative
    ]
    
    for path in possible_paths:
        try:
            result = subprocess.run([path, "--help"], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0 or ("gnina" in result.stdout.lower() or "autodock" in result.stdout.lower()):
                return path
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            continue
    return None


def process_single_ligand(args) -> Dict[str, Any]:
    """
    Process a single ligand with GNINA Docker container - for multiprocessing.
    This function is defined at module level to be picklable.
    """
    ligand_file, receptor_file, config_file, drug_name, ligand_id, cores_per_job, output_dir, ref_ligand_file = args

    # Use drug name for output files instead of ligand_id
    # Clean drug name for filename (remove spaces, special chars)
    clean_drug_name = drug_name.replace(' ', '_').replace('/', '_').replace('\\', '_').replace('<', '').replace('>', '')

    output_dir_path = Path(output_dir)
    output_pdbqt_file = output_dir_path / f"{clean_drug_name}.sdf"  # GNINA outputs SDF by default
    log_file = output_dir_path / f"{clean_drug_name}_log.txt"

    # Set up logging for this process
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"🔬 Starting containerized docking for {drug_name} ({ligand_id})")
    logger.info(f"   Ligand: {ligand_file}")
    logger.info(f"   Receptor: {receptor_file}")
    logger.info(f"   Config: {config_file}")

    try:
        # Check if input files exist
        if not os.path.exists(ligand_file):
            error_msg = f"Ligand file not found: {ligand_file}"
            logger.error(f"❌ {error_msg}")
            return {
                "success": False,
                "drug_name": drug_name,
                "ligand_id": ligand_id,
                "error": error_msg
            }

        if not os.path.exists(receptor_file):
            error_msg = f"Receptor file not found: {receptor_file}"
            logger.error(f"❌ {error_msg}")
            return {
                "success": False,
                "drug_name": drug_name,
                "ligand_id": ligand_id,
                "error": error_msg
            }

        if not os.path.exists(config_file):
            error_msg = f"Config file not found: {config_file}"
            logger.error(f"❌ {error_msg}")
            return {
                "success": False,
                "drug_name": drug_name,
                "ligand_id": ligand_id,
                "error": error_msg
            }

        # Read config to get binding site parameters
        config_params = {}
        try:
            with open(config_file, 'r') as f:
                for line in f:
                    if '=' in line and not line.strip().startswith('#'):
                        key, value = line.strip().split('=', 1)
                        config_params[key.strip()] = value.strip()
        except Exception as e:
            logger.error(f"Failed to read config file: {e}")
            return {
                "success": False,
                "drug_name": drug_name,
                "ligand_id": ligand_id,
                "error": f"Failed to read config file: {e}"
            }

        logger.info(f"   Using GNINA Docker container")

        # Extract docking parameters
        center_x = float(config_params.get('center_x', 15.2))
        center_y = float(config_params.get('center_y', 18.7))
        center_z = float(config_params.get('center_z', 12.3))
        size_x = float(config_params.get('size_x', 20.0))
        size_y = float(config_params.get('size_y', 20.0))
        size_z = float(config_params.get('size_z', 20.0))
        exhaustiveness = int(config_params.get('exhaustiveness', 8))
        num_modes = int(config_params.get('num_modes', 9))

        # Create unique output directory for this ligand
        ligand_output_dir = output_dir_path / f"ligand_{ligand_id}"
        ligand_output_dir.mkdir(exist_ok=True)

        logger.info(f"   Binding site: ({center_x}, {center_y}, {center_z})")
        logger.info(f"   Search box: {size_x} x {size_y} x {size_z}")
        logger.info(f"   Exhaustiveness: {exhaustiveness}, Modes: {num_modes}")

        start_time = time.time()

        # Use the GNINA Local service singleton

        # Create detailed log file for this ligand
        ligand_log_file = ligand_output_dir / f"{clean_drug_name}_detailed.log"
        with open(ligand_log_file, 'w') as f:
            f.write(f"=== Ligand Docking Log ===\n")
            f.write(f"Drug name: {drug_name}\n")
            f.write(f"Ligand ID: {ligand_id}\n")
            f.write(f"Receptor file: {receptor_file}\n")
            f.write(f"Ligand file: {ligand_file}\n")
            f.write(f"Output directory: {ligand_output_dir}\n")
            f.write(f"Reference ligand: {ref_ligand_file}\n")
            f.write(f"Binding site: ({center_x}, {center_y}, {center_z})\n")
            f.write(f"Search box: {size_x} x {size_y} x {size_z}\n")
            f.write(f"Exhaustiveness: {exhaustiveness}, Modes: {num_modes}\n")
            f.write(f"=== Starting Local GNINA Docking ===\n")

        logger.info(f"📝 Ligand log file created: {ligand_log_file}")

        # Run docking using GNINA Local service with reference ligand if available
        docking_result = gnina_local_service.dock_molecule(
            receptor_path=receptor_file,
            ligand_path=ligand_file,
            output_dir=str(ligand_output_dir),
            center_x=center_x,
            center_y=center_y,
            center_z=center_z,
            size_x=size_x,
            size_y=size_y,
            size_z=size_z,
            exhaustiveness=exhaustiveness,
            num_modes=num_modes,
            ref_ligand_path=ref_ligand_file,
            seed=42,
            cpu=cores_per_job
        )

        # Log the docking result
        with open(ligand_log_file, 'a') as f:
            f.write(f"=== Docking Result ===\n")
            f.write(f"Success: {docking_result.get('success', False)}\n")
            f.write(f"Output path: {docking_result.get('output_path')}\n")
            f.write(f"Log path: {docking_result.get('log_path')}\n")
            f.write(f"Error: {docking_result.get('error', 'None')}\n")
            f.write(f"Command used: {docking_result.get('command_used', 'None')}\n")
            f.write(f"GNINA log file: {docking_result.get('log_file', 'None')}\n")
            if 'stderr' in docking_result:
                f.write(f"STDERR: {docking_result['stderr']}\n")
            f.write(f"=== End Docking Result ===\n")

        end_time = time.time()
        processing_time = round(end_time - start_time, 2)

        if not docking_result["success"]:
            logger.error(f"   ❌ GNINA Docker docking failed: {docking_result.get('error', 'Unknown error')}")
            return {
                "success": False,
                "drug_name": drug_name,
                "ligand_id": ligand_id,
                "error": docking_result.get("error", "Docker docking failed"),
                "processing_time": processing_time
            }

        logger.info(f"   ✅ GNINA Docker completed in {processing_time:.1f}s")

        # Parse the output PDBQT file and log to extract binding affinities
        output_path = docking_result.get("output_path")
        log_path = docking_result.get("log_path")
        log_content = docking_result.get("log_content", "")

        if output_path and os.path.exists(output_path):
            try:
                # Parse log content to extract scores (GNINA outputs scores to log)
                gnina_modes = []

                # Try to parse from log content first
                if log_content:
                    gnina_modes = parse_gnina_output_detailed(log_content)

                # If no modes found in log content, try reading log file
                if not gnina_modes and log_path and os.path.exists(log_path):
                    with open(log_path, 'r') as f:
                        log_file_content = f.read()
                    gnina_modes = parse_gnina_output_detailed(log_file_content)

                # If still no modes, try parsing output file if it's SDF format
                if not gnina_modes and output_path.endswith('.sdf'):
                    gnina_modes = parse_sdf_output(output_path)

                if gnina_modes:
                    # Sort modes by affinity (best = most negative)
                    gnina_modes_sorted = sorted(gnina_modes, key=lambda x: x['affinity'])
                    best_mode = gnina_modes_sorted[0]
                    logger.info(f"   Found {len(gnina_modes)} binding modes")
                    logger.info(f"   Best affinity: {best_mode['affinity']} kcal/mol (mode {best_mode['mode']})")

                    # Copy the output file to the expected location
                    final_output_file = str(output_pdbqt_file)
                    if output_path != final_output_file:
                        shutil.copy2(output_path, final_output_file)

                    return {
                        "success": True,
                        "drug_name": drug_name,
                        "ligand_id": ligand_id,
                        "best_affinity": best_mode['affinity'],
                        "best_mode": best_mode['mode'],
                        "cnn_score": best_mode.get('cnn_score'),
                        "cnn_affinity": best_mode.get('cnn_affinity'),
                        "rmsd_lb": best_mode.get('rmsd_lb'),
                        "rmsd_ub": best_mode.get('rmsd_ub'),
                        "processing_time": processing_time,
                        "output_file": final_output_file,
                        "all_modes": gnina_modes_sorted,
                        "detailed_modes": gnina_modes_sorted
                    }
                else:
                    logger.error(f"   ❌ No binding modes found in GNINA output")
                    logger.error(f"   Log content preview: {log_content[:500]}...")
                    return {
                        "success": False,
                        "drug_name": drug_name,
                        "ligand_id": ligand_id,
                        "error": "No binding modes found in output",
                        "processing_time": processing_time
                    }

            except Exception as e:
                logger.error(f"   ❌ Failed to parse GNINA output: {e}")
                return {
                    "success": False,
                    "drug_name": drug_name,
                    "ligand_id": ligand_id,
                    "error": f"Failed to parse output: {str(e)}",
                    "processing_time": processing_time
                }
        else:
            logger.error(f"   ❌ Output file not found: {output_path}")
            return {
                "success": False,
                "drug_name": drug_name,
                "ligand_id": ligand_id,
                "error": "Output file not generated",
                "processing_time": processing_time
            }

    except Exception as e:
        error_msg = f"Unexpected error in Docker docking: {str(e)}"
        logger.error(f"   ❌ {error_msg}")
        import traceback
        logger.error(f"   Traceback: {traceback.format_exc()}")
        return {
            "success": False,
            "drug_name": drug_name,
            "ligand_id": ligand_id,
            "error": error_msg
        }


def parse_gnina_output_detailed(stdout_text: str) -> List[Dict[str, Any]]:
    """Parse all binding modes from GNINA output with CNN scoring."""
    results = []
    lines = stdout_text.split('\n')
    
    parsing_modes = False
    
    # Try different parsing approaches for GNINA
    for i, line in enumerate(lines):
        line = line.strip()
        
        # Method 1: Look for standard table format
        if ('mode |' in line and ('affinity' in line or 'CNNscore' in line)):
            parsing_modes = True
            continue
        
        # Method 2: Look for individual affinity lines
        if 'Affinity:' in line:
            try:
                # Format: "Affinity: -8.5 (kcal/mol)" or "Affinity: -8.5"
                affinity_part = line.split('Affinity:')[1].strip()
                affinity_str = affinity_part.split()[0].replace('(', '').replace(')', '')
                affinity = float(affinity_str)
                
                results.append({
                    'mode': len(results) + 1,
                    'affinity': affinity,
                    'rmsd_lb': None,
                    'rmsd_ub': None
                })
                continue
            except (ValueError, IndexError):
                pass
        
        # Method 3: Look for "Best binding affinity" or similar
        if ('binding affinity' in line.lower() or 'best affinity' in line.lower()) and ':' in line:
            try:
                affinity_part = line.split(':')[1].strip()
                affinity = float(affinity_part.split()[0])
                
                results.append({
                    'mode': 1,
                    'affinity': affinity,
                    'rmsd_lb': None,
                    'rmsd_ub': None
                })
                continue
            except (ValueError, IndexError):
                pass
        
        # Method 4: Standard table parsing when in parsing mode
        if parsing_modes and line and not line.startswith('#'):
            # Skip separator lines
            if '-----' in line or '=====' in line or line.startswith('mode |'):
                continue
                
            parts = line.split()
            if len(parts) >= 2 and parts[0].isdigit():
                try:
                    mode = int(parts[0])
                    
                    # Check if this is GNINA extended format with CNN scoring
                    if len(parts) >= 5 and ('CNN' in stdout_text):
                        # Format: mode | affinity | intramol | CNN pose score | CNN affinity
                        affinity = float(parts[1])
                        intramol = float(parts[2])
                        cnn_pose_score = float(parts[3])
                        cnn_affinity = float(parts[4])
                        
                        results.append({
                            'mode': mode,
                            'affinity': affinity,
                            'intramol': intramol,
                            'cnn_pose_score': cnn_pose_score,
                            'cnn_affinity': cnn_affinity,
                            'rmsd_lb': None,
                            'rmsd_ub': None
                        })
                    elif len(parts) >= 4 and ('CNNscore' in stdout_text or 'CNNaffinity' in stdout_text):
                        # Legacy format: mode | CNNscore | CNNaffinity | rmsd_lb | rmsd_ub
                        cnn_score = float(parts[1])
                        cnn_affinity = float(parts[2])
                        affinity = cnn_affinity
                        rmsd_lb = float(parts[3]) if len(parts) > 3 else None
                        rmsd_ub = float(parts[4]) if len(parts) > 4 else None
                        
                        results.append({
                            'mode': mode,
                            'affinity': affinity,
                            'cnn_score': cnn_score,
                            'cnn_affinity': cnn_affinity,
                            'rmsd_lb': rmsd_lb,
                            'rmsd_ub': rmsd_ub
                        })
                    else:
                        # Standard format: mode | affinity | rmsd_lb | rmsd_ub
                        affinity = float(parts[1])
                        rmsd_lb = float(parts[2]) if len(parts) > 2 else None
                        rmsd_ub = float(parts[3]) if len(parts) > 3 else None
                        
                        results.append({
                            'mode': mode,
                            'affinity': affinity,
                            'rmsd_lb': rmsd_lb,
                            'rmsd_ub': rmsd_ub
                        })
                except (ValueError, IndexError):
                    continue
        
        # Stop parsing if we hit certain end markers
        if parsing_modes and ('Writing output' in line or 'Refining results' in line or 'Performance:' in line):
            break
    
    # Method 5: Last resort - look for any numeric values that could be affinities
    if not results:
        for line in lines:
            # Look for patterns like "Score: -8.5" or similar
            if any(keyword in line.lower() for keyword in ['score:', 'energy:', 'affinity']):
                # Extract numeric values that could be affinities (typically negative)
                import re
                numbers = re.findall(r'-?\d+\.?\d*', line)
                for num_str in numbers:
                    try:
                        num = float(num_str)
                        if -50 <= num <= 50:  # Reasonable range for binding affinities
                            results.append({
                                'mode': len(results) + 1,
                                'affinity': num,
                                'rmsd_lb': None,
                                'rmsd_ub': None
                            })
                            break
                    except ValueError:
                        continue
    
    return results

def parse_vina_output_detailed(stdout_text: str) -> List[Dict[str, Any]]:
    """Parse all binding modes from Vina output."""
    results = []
    lines = stdout_text.split('\n')
    
    parsing_modes = False
    for line in lines:
        # Find results table
        if 'mode |   affinity | dist from best mode' in line:
            parsing_modes = True
            continue
        
        # Skip separator line
        if parsing_modes and '-----+------------+----------+----------' in line:
            continue
        
        # Parse each mode
        if parsing_modes and line.strip():
            parts = line.split()
            if len(parts) >= 2:
                try:
                    mode = int(parts[0])
                    affinity = float(parts[1])
                    rmsd_lb = float(parts[2]) if len(parts) > 2 else None
                    rmsd_ub = float(parts[3]) if len(parts) > 3 else None
                    
                    results.append({
                        'mode': mode,
                        'affinity': affinity,
                        'rmsd_lb': rmsd_lb,
                        'rmsd_ub': rmsd_ub
                    })
                except (ValueError, IndexError):
                    continue
        
        # Stop at end of table
        if parsing_modes and line.startswith('Writing output'):
            break

    return results


def parse_sdf_output(sdf_file_path: str) -> List[Dict[str, Any]]:
    """Parse GNINA SDF output to extract binding modes and scores."""
    results = []

    try:
        # Try using RDKit first (preferred method)
        try:
            from rdkit import Chem

            supplier = Chem.SDMolSupplier(sdf_file_path)
            mode_count = 1

            for mol in supplier:
                if mol is None:
                    continue

                # Extract properties from the molecule
                props = mol.GetPropsAsDict()

                # Common GNINA property names
                affinity = None
                cnn_score = None
                cnn_affinity = None

                # Try different property names for affinity
                for prop_name in ['minimizedAffinity', 'affinity', 'docking_score', 'score']:
                    if prop_name in props:
                        try:
                            affinity = float(props[prop_name])
                            break
                        except (ValueError, TypeError):
                            continue

                # Try CNN score properties
                for prop_name in ['CNNscore', 'cnn_score', 'CNN_score']:
                    if prop_name in props:
                        try:
                            cnn_score = float(props[prop_name])
                            break
                        except (ValueError, TypeError):
                            continue

                # Try CNN affinity properties
                for prop_name in ['CNNaffinity', 'cnn_affinity', 'CNN_affinity']:
                    if prop_name in props:
                        try:
                            cnn_affinity = float(props[prop_name])
                            break
                        except (ValueError, TypeError):
                            continue

                # Use CNN affinity as primary affinity if available and no regular affinity
                if affinity is None and cnn_affinity is not None:
                    affinity = cnn_affinity

                # If still no affinity found, try to extract from molecule name or comment
                if affinity is None:
                    mol_name = mol.GetProp('_Name') if mol.HasProp('_Name') else ''
                    if 'affinity' in mol_name.lower():
                        import re
                        numbers = re.findall(r'-?\d+\.?\d*', mol_name)
                        for num_str in numbers:
                            try:
                                potential_affinity = float(num_str)
                                if -50 <= potential_affinity <= 50:  # Reasonable range
                                    affinity = potential_affinity
                                    break
                            except ValueError:
                                continue

                if affinity is not None:
                    result = {
                        'mode': mode_count,
                        'affinity': affinity,
                        'rmsd_lb': None,
                        'rmsd_ub': None
                    }

                    if cnn_score is not None:
                        result['cnn_score'] = cnn_score
                    if cnn_affinity is not None:
                        result['cnn_affinity'] = cnn_affinity

                    results.append(result)
                    mode_count += 1

            if results:
                return results

        except ImportError:
            logger.warning("RDKit not available for SDF parsing, trying manual parsing")
        except Exception as e:
            logger.warning(f"RDKit SDF parsing failed: {e}, trying manual parsing")

        # Manual SDF parsing fallback
        with open(sdf_file_path, 'r') as f:
            content = f.read()

        # Split by molecule delimiter
        molecules = content.split('$$$$')
        mode_count = 1

        for mol_block in molecules:
            if not mol_block.strip():
                continue

            lines = mol_block.strip().split('\n')
            affinity = None
            cnn_score = None
            cnn_affinity = None

            # Parse property block
            for i, line in enumerate(lines):
                line = line.strip()

                # Look for property names
                if line.startswith('> <') and line.endswith('>'):
                    prop_name = line[3:-1].strip()

                    # Get the value from the next line
                    if i + 1 < len(lines):
                        prop_value = lines[i + 1].strip()

                        try:
                            if prop_name.lower() in ['minimizedaffinity', 'affinity', 'docking_score', 'score']:
                                affinity = float(prop_value)
                            elif prop_name.lower() in ['cnnscore', 'cnn_score']:
                                cnn_score = float(prop_value)
                            elif prop_name.lower() in ['cnnaffinity', 'cnn_affinity']:
                                cnn_affinity = float(prop_value)
                        except (ValueError, TypeError):
                            continue

            # Use CNN affinity if no regular affinity found
            if affinity is None and cnn_affinity is not None:
                affinity = cnn_affinity

            if affinity is not None:
                result = {
                    'mode': mode_count,
                    'affinity': affinity,
                    'rmsd_lb': None,
                    'rmsd_ub': None
                }

                if cnn_score is not None:
                    result['cnn_score'] = cnn_score
                if cnn_affinity is not None:
                    result['cnn_affinity'] = cnn_affinity

                results.append(result)
                mode_count += 1

        return results

    except Exception as e:
        logger.error(f"Failed to parse SDF output: {e}")
        return []