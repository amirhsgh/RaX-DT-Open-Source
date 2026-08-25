"""
GNINA Docker Service for running molecular docking in containerized environment.
"""

import os
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


class GninaDockerService:
    """Service for running GNINA docking in Docker container."""

    def __init__(self):
        self.image_name = "gnina/gnina"
        self.uploads_mount = "/app/uploads"  # Mount for uploads
        self.temp_mount = "/tmp/virtual_screening"  # Mount for temp data


    def _run_gnina_command(
        self,
        receptor_path: str,
        ligand_path: str,
        output_path: str,
        log_path: str,
        ref_ligand_path: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Execute GNINA command in Docker container with volume mounts."""

        try:
            # Get absolute paths for mounting
            from pathlib import Path
            import os

            uploads_dir = Path(settings.UPLOAD_DIR).resolve()
            temp_dir = Path(settings.TEMP_DIR).resolve()

            # Ensure we have absolute paths
            logger.info(f"📁 Upload directory (absolute): {uploads_dir}")
            logger.info(f"📁 Temp directory (absolute): {temp_dir}")

            # Verify paths exist
            uploads_dir.mkdir(parents=True, exist_ok=True)
            temp_dir.mkdir(parents=True, exist_ok=True)

            # Convert local paths to container paths
            def to_container_path(local_path: str) -> str:
                local_abs = Path(local_path).resolve()

                # Check if path is under uploads directory
                if str(local_abs).startswith(str(uploads_dir)):
                    rel_path = local_abs.relative_to(uploads_dir)
                    return f"{self.uploads_mount}/{rel_path}".replace("\\", "/")

                # Check if path is under temp directory
                elif str(local_abs).startswith(str(temp_dir)):
                    rel_path = local_abs.relative_to(temp_dir)
                    return f"{self.temp_mount}/{rel_path}".replace("\\", "/")

                # If not under either mounted directory, this is an error
                else:
                    raise ValueError(f"File path {local_path} is not under mounted directories")

            # Build docker run command with volume mounts
            docker_cmd = [
                "docker", "run", "--rm",
                "-v", f"{uploads_dir}:{self.uploads_mount}",
                "-v", f"{temp_dir}:{self.temp_mount}",
                self.image_name
            ]

            # Convert paths to container paths
            container_receptor = to_container_path(receptor_path)
            container_ligand = to_container_path(ligand_path)
            container_output = to_container_path(output_path)
            container_log = to_container_path(log_path)

            # Build GNINA command arguments
            gnina_cmd = [
                "gnina",
                "--receptor", container_receptor,
                "--ligand", container_ligand,
                "--out", container_output,
                "--log", container_log,
                "--seed", str(kwargs.get('seed', 42)),
                "--cpu", str(kwargs.get('cpu', 8)),
                "--exhaustiveness", str(kwargs.get('exhaustiveness', 8)),
                "--num_modes", str(kwargs.get('num_modes', 9)),
                "--min_rmsd_filter", "1"
            ]

            # Add autobox_ligand if reference ligand provided
            if ref_ligand_path:
                container_ref_ligand = to_container_path(ref_ligand_path)
                gnina_cmd.extend(["--autobox_ligand", container_ref_ligand])
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

            # Combine docker and gnina commands
            full_cmd = docker_cmd + gnina_cmd

            logger.info(f"Running GNINA Docker command: {' '.join(full_cmd)}")
            logger.info(f"Volume mounts: {uploads_dir} -> {self.uploads_mount}, {temp_dir} -> {self.temp_mount}")

            # Create debug log directory
            debug_log_dir = Path(temp_dir) / "gnina_logs"
            debug_log_dir.mkdir(exist_ok=True)

            # Create unique log file name
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            cmd_log_file = debug_log_dir / f"gnina_command_{timestamp}.log"

            # Save command to log file
            with open(cmd_log_file, 'w') as f:
                f.write(f"=== GNINA Docker Command Log ===\n")
                f.write(f"Timestamp: {timestamp}\n")
                f.write(f"Command: {' '.join(full_cmd)}\n")
                f.write(f"Volume mounts: {uploads_dir} -> {self.uploads_mount}, {temp_dir} -> {self.temp_mount}\n")
                f.write(f"Container paths:\n")
                f.write(f"  Receptor: {container_receptor}\n")
                f.write(f"  Ligand: {container_ligand}\n")
                f.write(f"  Output: {container_output}\n")
                f.write(f"  Log: {container_log}\n")
                if ref_ligand_path:
                    f.write(f"  Ref Ligand: {to_container_path(ref_ligand_path)}\n")
                f.write(f"=== Command Execution ===\n")

            result = subprocess.run(
                full_cmd,
                capture_output=True,
                text=True,
                timeout=24 * 60 * 60  # 24 hours timeout for complex proteins
            )

            # Save complete results to log file
            with open(cmd_log_file, 'a') as f:
                f.write(f"Return code: {result.returncode}\n")
                f.write(f"=== STDOUT ===\n")
                f.write(result.stdout)
                f.write(f"\n=== STDERR ===\n")
                f.write(result.stderr)
                f.write(f"\n=== END LOG ===\n")

            logger.info(f"📝 GNINA execution log saved to: {cmd_log_file}")

            # Also log to console for immediate debugging
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
                "command": ' '.join(full_cmd),
                "log_file": str(cmd_log_file)
            }

        except subprocess.TimeoutExpired:
            logger.error("GNINA Docker command timed out")
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": "Command timed out",
                "success": False
            }
        except Exception as e:
            logger.error(f"Failed to run GNINA Docker command: {e}")
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
        Perform molecular docking using GNINA Docker container with volume mounts.

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

            # Run GNINA with volume mounts
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
                **kwargs
            )

            if not result["success"]:
                logger.error(f"GNINA Docker docking failed: {result['stderr']}")
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
            logger.error(f"Error in GNINA Docker docking: {e}")
            return {
                "success": False,
                "error": str(e),
                "output_path": None,
                "log_content": ""
            }

    def check_gnina_availability(self) -> Dict[str, Any]:
        """Check if GNINA Docker image is available."""
        try:
            # Check if gnina/gnina image is available
            result = subprocess.run(
                ["docker", "run", "--rm", self.image_name, "gnina", "--help"],
                capture_output=True,
                text=True,
                timeout=30
            )
            return {
                "available": result.returncode == 0,
                "version_info": result.stdout if result.returncode == 0 else result.stderr,
                "image": self.image_name
            }
        except Exception as e:
            return {
                "available": False,
                "error": str(e),
                "image": self.image_name
            }



# Global instance
gnina_docker_service = GninaDockerService()