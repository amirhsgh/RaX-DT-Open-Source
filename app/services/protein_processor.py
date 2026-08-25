"""
Protein processing service that integrates your existing protein preparation code.
"""

import os
import subprocess
import logging
from pathlib import Path
from typing import Dict, Any, List

from app.core.config import settings

logger = logging.getLogger(__name__)


class ProteinProcessor:
    """Service for processing protein structures for docking."""
    
    def __init__(self):
        self.temp_dir = Path(settings.TEMP_DIR)
        self.temp_dir.mkdir(exist_ok=True)
    
    async def prepare_protein_structure(
        self,
        input_file: str,
        job_id: str,
        pH: float = 7.4
    ) -> Dict[str, Any]:
        """
        Prepare protein structure for docking.
        Based on your 2_prepare_protein.py script.
        """
        logger.info(f"🧬 Preparing protein structure for job {job_id}")

        job_dir = self.temp_dir / job_id
        job_dir.mkdir(exist_ok=True)

        output_file = job_dir / "receptor.pdbqt"

        try:
            if not os.path.exists(input_file):
                raise FileNotFoundError(f"Input protein file '{input_file}' not found")

            # Check if input file is already PDBQT format
            input_path = Path(input_file)
            file_extension = input_path.suffix.lower()

            if file_extension == '.pdbqt':
                logger.info("   Input file is already in PDBQT format, skipping conversion...")

                # Validate PDBQT file by checking its content
                is_valid_pdbqt = self._validate_pdbqt_file(input_file)

                if is_valid_pdbqt:
                    # Just copy the file and clean it up
                    logger.info("   Cleaning up PDBQT file for docking compatibility...")
                    with open(input_file, 'r') as infile, open(output_file, 'w') as outfile:
                        for line in infile:
                            # Keep ATOM and HETATM lines, remove unwanted records
                            if (line.startswith(('ATOM', 'HETATM')) or
                                (line.startswith(('MODEL', 'ENDMDL', 'TER', 'END')) and line.strip())):
                                outfile.write(line)

                    # Get protein statistics
                    stats = self._analyze_protein_structure(output_file)

                    logger.info(f"✅ PDBQT file processed successfully: {output_file}")

                    return {
                        "success": True,
                        "output_file": str(output_file),
                        "name": self._extract_protein_name(input_file),
                        "file_size": output_file.stat().st_size,
                        "atom_count": stats.get("atom_count", 0),
                        "chain_count": stats.get("chain_count", 0),
                        "residue_count": stats.get("residue_count", 0)
                    }
                else:
                    logger.error("   Invalid PDBQT file format")
                    return {
                        "success": False,
                        "error": "Invalid PDBQT file format. Please check your file."
                    }

            # For PDB files, proceed with normal conversion
            logger.info("   Processing PDB file - filtering and converting...")

            # Step 1: Filter PDB file to keep only ATOM lines
            logger.info("   Filtering input PDB file...")
            temp_pdb = job_dir / "temp_protein_cleaned.pdb"

            with open(input_file, 'r') as infile, open(temp_pdb, 'w') as outfile:
                for line in infile:
                    if line.startswith('ATOM'):
                        outfile.write(line)

            logger.info("   Filtering completed.")

            # Step 2: Convert to PDBQT using OpenBabel
            logger.info("   Converting to PDBQT...")
            temp_pdbqt = job_dir / "temp_receptor.pdbqt"

            conversion_command = [
                settings.OBABEL_PATH,
                "-ipdb", str(temp_pdb),
                "-opdbqt",
                "-O", str(temp_pdbqt),
                f"--pH", str(pH),
                "-h"
            ]

            result = subprocess.run(
                conversion_command,
                capture_output=True,
                text=True,
                check=True
            )

            # Step 3: Clean up PDBQT file for Vina compatibility
            logger.info("   Cleaning up final PDBQT file...")

            with open(temp_pdbqt, 'r') as infile, open(output_file, 'w') as outfile:
                for line in infile:
                    if not line.startswith('REMARK') and \
                       not line.startswith('ROOT') and \
                       not line.startswith('ENDROOT') and \
                       not line.startswith('BRANCH') and \
                       not line.startswith('ENDBRANCH') and \
                       not line.startswith('TORSDOF') and \
                       line.strip() != '':
                        outfile.write(line)

            # Get protein statistics
            stats = self._analyze_protein_structure(output_file)

            # Cleanup temporary files
            if temp_pdb.exists():
                temp_pdb.unlink()
            if temp_pdbqt.exists():
                temp_pdbqt.unlink()

            logger.info(f"✅ Protein preparation completed: {output_file}")

            return {
                "success": True,
                "output_file": str(output_file),
                "name": self._extract_protein_name(input_file),
                "file_size": output_file.stat().st_size,
                "atom_count": stats.get("atom_count", 0),
                "chain_count": stats.get("chain_count", 0),
                "residue_count": stats.get("residue_count", 0)
            }
            
        except FileNotFoundError as e:
            logger.error(f"❌ File not found: {e}")
            return {
                "success": False,
                "error": str(e)
            }
        
        except subprocess.CalledProcessError as e:
            error_msg = f"OpenBabel conversion failed: {e.stderr if e.stderr else str(e)}"
            logger.error(f"❌ {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }
        
        except Exception as e:
            logger.error(f"❌ Protein preparation failed: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _analyze_protein_structure(self, pdbqt_file: str) -> Dict[str, int]:
        """Analyze protein structure to get statistics."""
        try:
            atom_count = 0
            chains = set()
            residues = set()
            
            with open(pdbqt_file, 'r') as f:
                for line in f:
                    if line.startswith(('ATOM', 'HETATM')):
                        atom_count += 1
                        
                        # Extract chain ID (column 21, 0-indexed = 20)
                        if len(line) > 21:
                            chain_id = line[21]
                            if chain_id.strip():
                                chains.add(chain_id)
                        
                        # Extract residue number (columns 22-26)
                        if len(line) > 26:
                            try:
                                res_num = int(line[22:26].strip())
                                residues.add(res_num)
                            except ValueError:
                                pass
            
            return {
                "atom_count": atom_count,
                "chain_count": len(chains),
                "residue_count": len(residues)
            }
            
        except Exception as e:
            logger.warning(f"Failed to analyze protein structure: {e}")
            return {
                "atom_count": 0,
                "chain_count": 0,
                "residue_count": 0
            }
    
    def _extract_protein_name(self, input_file: str) -> str:
        """Extract protein name from file path or PDB header."""
        try:
            # Try to get name from PDB header
            with open(input_file, 'r') as f:
                for line in f:
                    if line.startswith('HEADER'):
                        # Extract protein name from HEADER line
                        if len(line) > 50:
                            return line[10:50].strip()
                        break
                    elif line.startswith('TITLE'):
                        # Extract from TITLE line
                        return line[10:].strip()
            
            # Fallback to filename
            return Path(input_file).stem
            
        except Exception:
            return Path(input_file).stem
    
    async def validate_binding_site(
        self,
        protein_file: str,
        center_x: float,
        center_y: float, 
        center_z: float,
        size_x: float = 20.0,
        size_y: float = 20.0,
        size_z: float = 20.0
    ) -> Dict[str, Any]:
        """
        Validate binding site coordinates against protein structure.
        """
        try:
            # Read protein structure and find atoms within binding site
            atoms_in_site = 0
            protein_bounds = {"min_x": float('inf'), "max_x": float('-inf'),
                            "min_y": float('inf'), "max_y": float('-inf'),
                            "min_z": float('inf'), "max_z": float('-inf')}
            
            with open(protein_file, 'r') as f:
                for line in f:
                    if line.startswith(('ATOM', 'HETATM')):
                        try:
                            x = float(line[30:38].strip())
                            y = float(line[38:46].strip())
                            z = float(line[46:54].strip())
                            
                            # Update protein bounds
                            protein_bounds["min_x"] = min(protein_bounds["min_x"], x)
                            protein_bounds["max_x"] = max(protein_bounds["max_x"], x)
                            protein_bounds["min_y"] = min(protein_bounds["min_y"], y)
                            protein_bounds["max_y"] = max(protein_bounds["max_y"], y)
                            protein_bounds["min_z"] = min(protein_bounds["min_z"], z)
                            protein_bounds["max_z"] = max(protein_bounds["max_z"], z)
                            
                            # Check if atom is within binding site
                            if (abs(x - center_x) <= size_x/2 and
                                abs(y - center_y) <= size_y/2 and
                                abs(z - center_z) <= size_z/2):
                                atoms_in_site += 1
                                
                        except (ValueError, IndexError):
                            continue
            
            # Validate binding site is within protein bounds
            site_within_protein = (
                protein_bounds["min_x"] <= center_x - size_x/2 and
                protein_bounds["max_x"] >= center_x + size_x/2 and
                protein_bounds["min_y"] <= center_y - size_y/2 and
                protein_bounds["max_y"] >= center_y + size_y/2 and
                protein_bounds["min_z"] <= center_z - size_z/2 and
                protein_bounds["max_z"] >= center_z + size_z/2
            )
            
            return {
                "valid": atoms_in_site > 0,
                "atoms_in_site": atoms_in_site,
                "site_within_protein": site_within_protein,
                "protein_bounds": protein_bounds,
                "binding_site": {
                    "center": [center_x, center_y, center_z],
                    "size": [size_x, size_y, size_z]
                },
                "recommendations": self._get_binding_site_recommendations(
                    atoms_in_site, site_within_protein
                )
            }
            
        except Exception as e:
            logger.error(f"Binding site validation failed: {e}")
            return {
                "valid": False,
                "error": str(e)
            }
    
    def _get_binding_site_recommendations(
        self, atoms_in_site: int, site_within_protein: bool
    ) -> List[str]:
        """Get recommendations for binding site optimization."""
        recommendations = []
        
        if atoms_in_site == 0:
            recommendations.append("Binding site appears to be in empty space - consider adjusting coordinates")
        elif atoms_in_site < 10:
            recommendations.append("Very few atoms in binding site - consider expanding the search space")
        elif atoms_in_site > 500:
            recommendations.append("Many atoms in binding site - consider reducing search space for efficiency")
        
        if not site_within_protein:
            recommendations.append("Binding site extends beyond protein boundaries - consider adjusting size or position")
        
        if not recommendations:
            recommendations.append("Binding site appears well-defined")
        
        return recommendations

    def _validate_pdbqt_file(self, pdbqt_file: str) -> bool:
        """
        Validate if the file is a proper PDBQT format.
        PDBQT files should contain ATOM or HETATM lines with proper format.
        """
        try:
            atom_count = 0
            has_valid_format = False

            with open(pdbqt_file, 'r') as f:
                for line_num, line in enumerate(f, 1):
                    # Skip empty lines and comments
                    if not line.strip() or line.startswith('#'):
                        continue

                    # Check for ATOM or HETATM lines
                    if line.startswith(('ATOM', 'HETATM')):
                        atom_count += 1

                        # Basic format validation - PDBQT should have at least 78 characters for complete ATOM line
                        if len(line.strip()) >= 78:
                            try:
                                # Try to parse coordinates to validate format
                                x = float(line[30:38].strip())
                                y = float(line[38:46].strip())
                                z = float(line[46:54].strip())
                                has_valid_format = True
                            except (ValueError, IndexError):
                                logger.warning(f"Invalid coordinate format at line {line_num} in PDBQT file")
                                continue

                    # Allow other common PDB/PDBQT record types
                    elif line.startswith(('HEADER', 'TITLE', 'REMARK', 'MODEL', 'ENDMDL', 'TER', 'END')):
                        continue

                    # If we find unexpected content, it might not be a valid PDBQT
                    elif line.strip() and not line.startswith(('CONECT', 'MASTER')):
                        logger.warning(f"Unexpected line format at line {line_num}: {line.strip()[:50]}...")

            # File is valid if it has at least some ATOM records with proper format
            is_valid = atom_count > 0 and has_valid_format

            if is_valid:
                logger.info(f"   Valid PDBQT file with {atom_count} atoms")
            else:
                logger.error(f"   Invalid PDBQT file - atoms: {atom_count}, valid format: {has_valid_format}")

            return is_valid

        except Exception as e:
            logger.error(f"Error validating PDBQT file: {e}")
            return False