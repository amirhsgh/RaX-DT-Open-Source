"""
GNINA Local Service for running molecular docking on WSL2/Linux system.
"""

import os
import subprocess
import tempfile
import shutil
import threading
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


class GninaLocalService:
    """Service for running GNINA docking on local WSL2/Linux system."""

    def __init__(self):
        self.gnina_command = "gnina"  # Assumes gnina is in PATH
        self._running_processes = {}  # Track running processes
        self._process_lock = threading.Lock()  # Thread safety
        self.max_concurrent_jobs = 1  # Limit concurrent GNINA processes

    def _cleanup_finished_processes(self):
        """Remove finished processes from tracking."""
        with self._process_lock:
            finished_jobs = []
            for job_id, process in self._running_processes.items():
                if process.poll() is not None:
                    finished_jobs.append(job_id)

            for job_id in finished_jobs:
                del self._running_processes[job_id]

    def _can_start_new_process(self) -> bool:
        """Check if we can start a new GNINA process."""
        self._cleanup_finished_processes()
        with self._process_lock:
            return len(self._running_processes) < self.max_concurrent_jobs

    def _register_process(self, job_id: str, process: subprocess.Popen):
        """Register a running process."""
        with self._process_lock:
            self._running_processes[job_id] = process

    def _unregister_process(self, job_id: str):
        """Unregister a finished process."""
        with self._process_lock:
            if job_id in self._running_processes:
                del self._running_processes[job_id]

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a running GNINA job."""
        with self._process_lock:
            if job_id in self._running_processes:
                process = self._running_processes[job_id]
                try:
                    process.terminate()
                    import time
                    time.sleep(5)
                    if process.poll() is None:
                        process.kill()
                    self._unregister_process(job_id)
                    logger.info(f"Successfully cancelled GNINA job {job_id}")
                    return True
                except Exception as e:
                    logger.error(f"Failed to cancel job {job_id}: {e}")
                    return False
            return False

    def check_gnina_availability(self) -> Dict[str, Any]:
        """Check if GNINA is available on local system."""
        try:
            # For WSL2, we might need to call via wsl command
            if os.name == 'nt':  # Windows
                # Try WSL2 first
                result = subprocess.run(
                    ["wsl", "gnina", "--help"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    return {
                        "available": True,
                        "version_info": result.stdout,
                        "method": "wsl2"
                    }

            # Try direct command (Linux/direct WSL session)
            result = subprocess.run(
                [self.gnina_command, "--help"],
                capture_output=True,
                text=True,
                timeout=30
            )

            return {
                "available": result.returncode == 0,
                "version_info": result.stdout if result.returncode == 0 else result.stderr,
                "method": "direct"
            }

        except Exception as e:
            return {
                "available": False,
                "error": str(e),
                "method": "none"
            }

    def _get_gnina_command_prefix(self) -> List[str]:
        """Get the appropriate command prefix for running gnina."""
        if os.name == 'nt':  # Windows - use WSL2
            return ["wsl"]
        else:  # Linux/WSL session
            return []

    def _run_gnina_command(
        self,
        receptor_path: str,
        ligand_path: str,
        output_path: str,
        log_path: str,
        ref_ligand_path: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Execute GNINA command on local system."""

        try:
            # Get command prefix (wsl for Windows, empty for Linux)
            cmd_prefix = self._get_gnina_command_prefix()

            # For WSL2 from Windows, convert ALL paths to WSL paths consistently
            if os.name == 'nt':
                def to_wsl_path(win_path: str) -> str:
                    """Convert Windows path to WSL path format."""
                    win_path = str(Path(win_path).resolve())
                    # Convert C:\path\to\file to /mnt/c/path/to/file
                    if len(win_path) >= 3 and win_path[1] == ':':
                        drive_letter = win_path[0].lower()
                        path_part = win_path[3:].replace('\\', '/')
                        return f"/mnt/{drive_letter}/{path_part}"
                    return win_path.replace('\\', '/')

                # Convert ALL paths consistently
                receptor_path = to_wsl_path(receptor_path)
                ligand_path = to_wsl_path(ligand_path)
                output_path = to_wsl_path(output_path)
                log_path = to_wsl_path(log_path)

                if ref_ligand_path:
                    ref_ligand_path = to_wsl_path(ref_ligand_path)

            # Build GNINA command with conservative resource limits
            exhaustiveness = min(kwargs.get('exhaustiveness', 8), 8)  # Max exhaustiveness 8
            num_modes = min(kwargs.get('num_modes', 9), 12)  # Max 12 modes
            cpu_cores = min(kwargs.get('cpu', 2), 2)  # Max 2 CPU cores for stability

            gnina_cmd = cmd_prefix + [
                "gnina",
                "--receptor", receptor_path,
                "--ligand", ligand_path,
                "--out", output_path,
                "--log", log_path,
                "--seed", str(kwargs.get('seed', 42)),
                "--cpu", str(cpu_cores),
                "--exhaustiveness", str(exhaustiveness),
                "--num_modes", str(num_modes),
                "--min_rmsd_filter", "1",
            ]

            # Add autobox_ligand if reference ligand provided
            if ref_ligand_path:
                gnina_cmd.extend(["--autobox_ligand", ref_ligand_path])
                gnina_cmd.extend(["--autobox_add", str(kwargs.get('autobox_add', 4))])
            else:
                # Use explicit center and size
                gnina_cmd.extend([
                    "--center_x", str(kwargs.get('center_x', 15.2)),
                    "--center_y", str(kwargs.get('center_y', 18.7)),
                    "--center_z", str(kwargs.get('center_z', 12.3)),
                    "--size_x", str(kwargs.get('size_x', 20.0)),
                    "--size_y", str(kwargs.get('size_y', 20.0)),
                    "--size_z", str(kwargs.get('size_z', 20.0))
                ])

            # Add CNN scoring if available
            if kwargs.get('cnn_scoring', False):
                gnina_cmd.append("--cnn")

            # Servers without a GPU (or where GNINA_USE_GPU=false is set
            # deliberately) need --no_gpu, otherwise GNINA's CNN scoring tries
            # to initialize CUDA and fails/hangs.
            if not settings.GNINA_USE_GPU:
                gnina_cmd.append("--no_gpu")

            logger.info(f"Running GNINA Local command: {' '.join(gnina_cmd)}")

            # Create debug log directory
            debug_log_dir = Path(settings.TEMP_DIR) / "gnina_logs"
            debug_log_dir.mkdir(exist_ok=True, parents=True)

            # Create unique log file name
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            cmd_log_file = debug_log_dir / f"gnina_local_command_{timestamp}.log"

            # Save command to log file
            with open(cmd_log_file, 'w') as f:
                f.write(f"=== GNINA Local Command Log ===\n")
                f.write(f"Timestamp: {timestamp}\n")
                f.write(f"Command: {' '.join(gnina_cmd)}\n")
                f.write(f"Method: {'WSL2' if os.name == 'nt' else 'Direct'}\n")
                f.write(f"Original paths:\n")
                f.write(f"  Receptor: {kwargs.get('original_receptor_path', receptor_path)}\n")
                f.write(f"  Ligand: {kwargs.get('original_ligand_path', ligand_path)}\n")
                f.write(f"  Output: {kwargs.get('original_output_path', output_path)}\n")
                f.write(f"  Log: {kwargs.get('original_log_path', log_path)}\n")
                f.write(f"=== Command Execution ===\n")

            # Use shorter timeout with progress monitoring
            timeout_seconds = kwargs.get('timeout', 3600)  # Default 1 hour timeout

            # Run with Popen for better control and monitoring
            process = subprocess.Popen(
                gnina_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )

            # Register the process for tracking and cancellation
            job_id = kwargs.get('job_id', 'unknown')
            self._register_process(job_id, process)

            # NOTE: this used to poll process.poll() in a loop and call
            # process.stdout.readline()/process.stderr.readline() one at a time.
            # Both of those are blocking reads: if GNINA was currently writing to
            # stderr (e.g. OpenBabel parsing warnings) while stdout had no new
            # line ready, the loop would block forever on stdout.readline() while
            # GNINA itself blocked on write() once its stderr pipe buffer filled -
            # a classic bidirectional pipe deadlock. GNINA would then sit at 0%
            # CPU indefinitely (visible as wchan=pipe_write on the child process),
            # never timing out because the loop was itself stuck, not the child.
            # communicate() drains both pipes concurrently and doesn't have this
            # problem; it also implements the timeout directly.
            import time
            start_time = time.time()

            try:
                stdout, stderr = process.communicate(timeout=timeout_seconds)
                result = type('Result', (), {
                    'returncode': process.returncode,
                    'stdout': stdout or '',
                    'stderr': stderr or ''
                })()

            except subprocess.TimeoutExpired:
                elapsed = time.time() - start_time
                logger.warning(f"GNINA process timed out after {elapsed:.1f} seconds")
                process.kill()
                stdout, stderr = process.communicate()
                result = type('Result', (), {
                    'returncode': -1,
                    'stdout': stdout or '',
                    'stderr': stderr or f"Process terminated due to timeout ({timeout_seconds}s)"
                })()
            except Exception as e:
                logger.error(f"Error monitoring GNINA process: {e}")
                process.kill()
                try:
                    stdout, stderr = process.communicate(timeout=5)
                except Exception:
                    stdout, stderr = '', ''

                result = type('Result', (), {
                    'returncode': -1,
                    'stdout': stdout or '',
                    'stderr': stderr or f"Process monitoring failed: {str(e)}"
                })()

            total_time = time.time() - start_time
            logger.info(f"GNINA process completed in {total_time:.1f} seconds")

            # Unregister the process
            self._unregister_process(job_id)

            # Save complete results to log file
            with open(cmd_log_file, 'a') as f:
                f.write(f"Return code: {result.returncode}\n")
                f.write(f"=== STDOUT ===\n")
                f.write(result.stdout)
                f.write(f"\n=== STDERR ===\n")
                f.write(result.stderr)
                f.write(f"\n=== END LOG ===\n")

            logger.info(f"📝 GNINA Local execution log saved to: {cmd_log_file}")
            logger.info(f"GNINA return code: {result.returncode}")

            if result.stdout:
                logger.info(f"GNINA stdout (first 500 chars): {result.stdout[:500]}...")
            if result.stderr:
                logger.error(f"GNINA stderr: {result.stderr}")

            return {
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "success": result.returncode == 0,
                "command": ' '.join(gnina_cmd),
                "log_file": str(cmd_log_file)
            }

        except subprocess.TimeoutExpired:
            logger.error("GNINA Local command timed out")
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": "Command timed out",
                "success": False
            }
        except Exception as e:
            logger.error(f"Failed to run GNINA Local command: {e}")
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": str(e),
                "success": False
            }

    def dock_molecule(
        self,
        receptor_path: str,
        ligand_path: str,
        output_dir: str,
        center_x: float,
        center_y: float,
        center_z: float,
        size_x: float = 20.0,
        size_y: float = 20.0,
        size_z: float = 20.0,
        exhaustiveness: int = 8,
        num_modes: int = 9,
        ref_ligand_path: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform molecular docking using local GNINA installation.

        Args:
            receptor_path: Path to receptor file (.pdbqt)
            ligand_path: Path to ligand file (.pdbqt)
            output_dir: Directory for output files
            center_x, center_y, center_z: Center coordinates for docking
            size_x, size_y, size_z: Search box dimensions
            exhaustiveness: Search exhaustiveness
            num_modes: Number of binding modes to generate
            ref_ligand_path: Optional reference ligand for autobox
            **kwargs: Additional GNINA parameters

        Returns:
            Dictionary with docking results
        """
        try:
            # Create output directory
            os.makedirs(output_dir, exist_ok=True)

            # Generate output file names
            job_id = Path(output_dir).name
            output_file = os.path.join(output_dir, "docked.pdbqt")
            log_file = os.path.join(output_dir, "docking_log.txt")

            # Check if we can start a new process
            if not self._can_start_new_process():
                logger.warning(f"Cannot start job {job_id}: Maximum concurrent jobs ({self.max_concurrent_jobs}) reached")
                return {
                    "success": False,
                    "error": f"Maximum concurrent jobs ({self.max_concurrent_jobs}) reached. Please wait for other jobs to complete.",
                    "output_path": None,
                    "log_content": "",
                    "command_used": ""
                }

            # Store original paths for logging
            original_paths = {
                'original_receptor_path': receptor_path,
                'original_ligand_path': ligand_path,
                'original_output_path': output_file,
                'original_log_path': log_file
            }

            # Run GNINA locally
            result = self._run_gnina_command(
                receptor_path=receptor_path,
                ligand_path=ligand_path,
                output_path=output_file,
                log_path=log_file,
                ref_ligand_path=ref_ligand_path,
                center_x=center_x,
                center_y=center_y,
                center_z=center_z,
                size_x=size_x,
                size_y=size_y,
                size_z=size_z,
                exhaustiveness=exhaustiveness,
                num_modes=num_modes,
                job_id=job_id,
                **original_paths,
                **kwargs
            )

            if not result["success"]:
                logger.error(f"GNINA Local docking failed: {result['stderr']}")
                return {
                    "success": False,
                    "error": result["stderr"],
                    "output_path": None,
                    "log_content": result["stdout"],
                    "command_used": result.get("command", "")
                }

            # Check if output files exist
            output_exists = os.path.exists(output_file)
            log_exists = os.path.exists(log_file)

            if not output_exists:
                logger.warning(f"Output file not created: {output_file}")

            return {
                "success": output_exists,
                "output_path": output_file if output_exists else None,
                "log_path": log_file if log_exists else None,
                "log_content": result["stdout"],
                "command_used": result.get("command", ""),
                "stderr": result["stderr"]
            }

        except Exception as e:
            logger.error(f"Error in GNINA Local docking: {e}")
            return {
                "success": False,
                "error": str(e),
                "output_path": None,
                "log_content": ""
            }


# Global instance
gnina_local_service = GninaLocalService()