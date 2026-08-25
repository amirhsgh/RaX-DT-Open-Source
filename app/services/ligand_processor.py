"""
Ligand processing service that integrates your existing ligand preparation code.
"""

import os
import subprocess
import logging
from pathlib import Path
from typing import Dict, Any, Optional
import tempfile

from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors

from app.core.config import settings

logger = logging.getLogger(__name__)


class LigandProcessor:
    """Service for processing ligand molecules through all preparation steps."""
    
    def __init__(self):
        self.temp_dir = Path(settings.TEMP_DIR)
        self.temp_dir.mkdir(exist_ok=True)
    
    @staticmethod
    def _read_input_molecules(input_file: str) -> list:
        """Read a user-supplied ligand file in any format the upload layer
        accepts.

        Previously this was always Chem.SDMolSupplier, so a .smi or .mol2
        upload silently yielded zero molecules and the job only failed much
        later, at the docking stage, with "Prepared ligand files not found"
        - even though /uploads/formats advertises SMILES and MOL2.
        """
        ext = Path(input_file).suffix.lower()

        if ext in {".smi", ".smiles", ".ism"}:
            mols = []
            with open(input_file, "r", errors="ignore") as f:
                for line in f:
                    parts = line.split()
                    if not parts:
                        continue
                    mol = Chem.MolFromSmiles(parts[0])
                    if mol is None:
                        continue
                    # Second column, when present, is the compound id.
                    mol.SetProp("_Name", parts[1] if len(parts) > 1 else f"mol_{len(mols) + 1}")
                    mols.append(mol)
            return mols

        if ext == ".mol2":
            mol = Chem.MolFromMol2File(input_file)
            return [mol] if mol is not None else []

        return [m for m in Chem.SDMolSupplier(input_file) if m is not None]

    async def generate_initial_3d_structures(
        self,
        input_file: str,
        job_id: str,
        original_filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Step 1: Generate initial 3D conformations for ligands.
        Based on your 1_prepare_ligands_part1.py script.
        """
        logger.info(f"🚀 Generating initial 3D conformations for job {job_id}")
        
        job_dir = self.temp_dir / job_id
        job_dir.mkdir(exist_ok=True)
        
        output_file = job_dir / "initial_3d_ligands.sdf"
        
        try:
            # Read input molecules
            if not os.path.exists(input_file):
                raise FileNotFoundError(f"Input ligand file '{input_file}' not found")
            
            mols = self._read_input_molecules(input_file)
            if not mols:
                raise ValueError(
                    f"No readable molecules found in '{Path(input_file).name}'. "
                    "Supported: .sdf, .mol, .mol2, .smi/.smiles."
                )
            writer = Chem.SDWriter(str(output_file))
            
            successful_mols = {}
            failed_molecules = []
            
            for i, mol in enumerate(mols):
                if mol is None:
                    continue

                try:
                    # Check if molecule already has 3D coordinates
                    has_3d = self._has_3d_coordinates(mol)

                    if has_3d:
                        # Molecule already has 3D coordinates, just add hydrogens and optimize
                        logger.info(f"Molecule {i+1} already has 3D coordinates, optimizing...")
                        mol_with_h = Chem.AddHs(mol, addCoords=True)
                        # Light optimization for existing 3D structures
                        AllChem.MMFFOptimizeMolecule(mol_with_h, maxIters=200)
                    else:
                        # Convert 2D to 3D
                        logger.info(f"Converting 2D molecule {i+1} to 3D...")
                        mol_with_h = Chem.AddHs(mol, addCoords=True)

                        # Embed 3D coordinates for 2D molecules
                        embed_result = AllChem.EmbedMolecule(mol_with_h, AllChem.ETKDGv2())
                        if embed_result != 0:
                            # If embedding fails, try with different parameters
                            logger.warning(f"Initial embedding failed for molecule {i+1}, trying alternative method...")
                            embed_result = AllChem.EmbedMolecule(mol_with_h, useRandomCoords=True)

                        if embed_result != 0:
                            logger.warning(f"Could not generate 3D coordinates for molecule {i+1}, skipping...")
                            continue

                        # Optimize with MMFF
                        AllChem.MMFFOptimizeMolecule(mol_with_h, maxIters=500)
                    
                    # Calculate molecular properties
                    properties = self._calculate_molecular_properties(mol_with_h)
                    
                    # Get molecule name with filename fallback
                    mol_name = self._get_molecule_name(mol, i+1, original_filename)
                    
                    # Write to output
                    writer.write(mol_with_h)
                    
                    successful_mols[f"mol_{i+1}"] = {
                        "name": mol_name,
                        "success": True,
                        "smiles": Chem.MolToSmiles(mol_with_h),
                        "output_file": str(output_file),
                        **properties
                    }
                    
                except Exception as e:
                    # Get molecule name with filename fallback
                    mol_name = self._get_molecule_name(mol, i+1, original_filename)
                    failed_molecules.append({
                        "index": i+1,
                        "name": mol_name,
                        "error": str(e)
                    })
                    logger.warning(f"Failed to generate 3D for molecule {i+1} ({mol_name}): {e}")
            
            writer.close()
            
            logger.info(f"✅ Generated 3D structures: {len(successful_mols)} successful, {len(failed_molecules)} failed")
            
            return {
                "success": True,
                "output_file": str(output_file),
                "molecules": successful_mols,
                "failed": failed_molecules,
                "stats": {
                    "total_input": len(successful_mols) + len(failed_molecules),
                    "successful": len(successful_mols),
                    "failed": len(failed_molecules)
                }
            }
            
        except Exception as e:
            logger.error(f"❌ 3D generation failed: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "molecules": {},
                "failed": []
            }
    
    async def run_advanced_preparation(
        self,
        input_file: str,
        job_id: str,
        pH: float = 7.4,
        max_tautomers: int = 1,
        max_stereoisomers: int = 1,
        use_stable_tautomers: bool = True
    ) -> Dict[str, Any]:
        """
        Step 3: Advanced ligand preparation (tautomers, protomers, stereoisomers).
        Based on your 1_prepare_ligands_part2_with_stable_tautomers.py script.
        """
        logger.info(f"⚗️ Running advanced ligand preparation for job {job_id}")
        
        job_dir = self.temp_dir / job_id
        
        try:
            # Step 1: Preliminary minimization
            minimized_file = await self._preliminary_minimization(input_file, job_dir)
            
            # Step 2: Enumerate tautomers
            tautomers_file = await self._enumerate_tautomers(
                minimized_file, job_dir, max_tautomers, use_stable_tautomers
            )
            
            # Step 3: Enumerate protonation states
            protomers_file = await self._enumerate_protomers(tautomers_file, job_dir, pH)
            
            # Step 4: Enumerate stereoisomers
            stereoisomers_file = await self._enumerate_stereoisomers(
                protomers_file, job_dir, max_stereoisomers
            )
            
            # Step 5: Final energy minimization
            final_file = await self._final_minimization(stereoisomers_file, job_dir)
            
            # Convert to PDBQT for docking
            pdbqt_dir = job_dir / "ligands_pdbqt"
            pdbqt_dir.mkdir(exist_ok=True)
            await self._convert_to_pdbqt(final_file, pdbqt_dir)
            
            # Count final molecules
            final_count = self._count_molecules_in_sdf(final_file)
            
            logger.info(f"✅ Advanced preparation completed: {final_count} final structures")
            
            return {
                "success": True,
                "final_structure": str(final_file),
                "pdbqt_directory": str(pdbqt_dir),
                "molecule_count": final_count,
                "processed": {}  # Could be expanded with per-molecule tracking
            }
            
        except Exception as e:
            logger.error(f"❌ Advanced preparation failed: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _preliminary_minimization(self, input_file: str, job_dir: Path) -> str:
        """Preliminary energy minimization of initial 3D conformations."""
        output_file = job_dir / "step2_minimized.sdf"
        
        command = [
            settings.OBABEL_PATH,
            "-isdf", str(input_file),
            "-osdf", "-O", str(output_file),
            "--minimize",
            "--ff", "MMFF94",
            "--steps", "200",
            "--sd"
        ]
        
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            logger.warning(f"Minimization warning: {result.stderr}")
            # If minimization fails, copy the original to the expected output location
            import shutil
            if Path(input_file).resolve() != Path(output_file).resolve():
                shutil.copy2(input_file, output_file)
                logger.info(f"Copied original file to minimization output: {output_file}")
            return str(output_file)
        
        return str(output_file)
    
    async def _enumerate_tautomers(
        self, 
        input_file: str, 
        job_dir: Path, 
        max_tautomers: int,
        use_stable_tautomers: bool
    ) -> str:
        """Enumerate tautomers with optional stable selection."""
        output_file = job_dir / "step3_tautomers.sdf"
        
        if use_stable_tautomers:
            # Use RDKit for stable tautomer selection
            return await self._enumerate_stable_tautomers_rdkit(
                input_file, output_file, max_tautomers
            )
        else:
            # Use OpenBabel fallback
            return await self._enumerate_tautomers_openbabel(
                input_file, output_file, max_tautomers
            )
    
    async def _enumerate_stable_tautomers_rdkit(
        self, input_file: str, output_file: str, max_tautomers: int
    ) -> str:
        """Use RDKit to enumerate and select stable tautomers."""
        try:
            from rdkit.Chem.MolStandardize import rdMolStandardize
            
            suppl = Chem.SDMolSupplier(str(input_file))
            writer = Chem.SDWriter(str(output_file))
            
            enumerator = rdMolStandardize.TautomerEnumerator()
            
            for mol in suppl:
                if mol is None:
                    continue
                
                try:
                    # Get canonical (most stable) tautomer
                    canonical = enumerator.Canonicalize(mol)
                    if canonical:
                        canonical = Chem.AddHs(canonical)
                        AllChem.EmbedMolecule(canonical, randomSeed=42)
                        AllChem.MMFFOptimizeMolecule(canonical)
                        writer.write(canonical)
                        
                        # Add a few more tautomers if requested
                        if max_tautomers > 1:
                            tautomers = enumerator.Enumerate(mol)
                            added = 0
                            for taut in tautomers:
                                if added >= max_tautomers - 1:
                                    break
                                if taut and not taut.HasSubstructMatch(canonical):
                                    taut = Chem.AddHs(taut)
                                    AllChem.EmbedMolecule(taut, randomSeed=42)
                                    AllChem.MMFFOptimizeMolecule(taut)
                                    writer.write(taut)
                                    added += 1
                
                except Exception as e:
                    logger.warning(f"Tautomer enumeration failed for molecule: {e}")
                    continue
            
            writer.close()
            return str(output_file)
            
        except Exception as e:
            logger.warning(f"RDKit tautomer enumeration failed: {e}, using fallback")
            return await self._enumerate_tautomers_openbabel(input_file, output_file, max_tautomers)
    
    async def _enumerate_tautomers_openbabel(
        self, input_file: str, output_file: str, max_tautomers: int
    ) -> str:
        """Fallback tautomer enumeration using OpenBabel."""
        # For simplicity, just copy input to output with 3D generation
        command = [
            settings.OBABEL_PATH,
            "-isdf", str(input_file),
            "-osdf", "-O", str(output_file),
            "--gen3d",
            "--ff", "MMFF94"
        ]
        
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            logger.warning(f"Tautomer enumeration failed: {result.stderr}")
            # If enumeration fails, copy the original to the expected output location
            import shutil
            if Path(input_file).resolve() != Path(output_file).resolve():
                shutil.copy2(input_file, output_file)
                logger.info(f"Copied original file to tautomer output: {output_file}")
            return str(output_file)
        
        return str(output_file)
    
    async def _enumerate_protomers(self, input_file: str, job_dir: Path, pH: float) -> str:
        """Enumerate protonation states at specified pH."""
        output_file = job_dir / "step4_protomers.sdf"
        
        command = [
            settings.OBABEL_PATH,
            "-isdf", str(input_file),
            "-osdf", "-O", str(output_file),
            f"--pH", str(pH),
            "-p"
        ]
        
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            logger.warning(f"Protomer enumeration failed: {result.stderr}")
            # If enumeration fails, copy the original to the expected output location
            import shutil
            if Path(input_file).resolve() != Path(output_file).resolve():
                shutil.copy2(input_file, output_file)
                logger.info(f"Copied original file to protomer output: {output_file}")
            return str(output_file)
        
        return str(output_file)
    
    async def _enumerate_stereoisomers(
        self, input_file: str, job_dir: Path, max_stereoisomers: int
    ) -> str:
        """Enumerate stereoisomers."""
        output_file = job_dir / "step5_stereoisomers.sdf"
        
        # Generate multiple conformers as proxy for stereoisomers
        command = [
            settings.OBABEL_PATH,
            "-isdf", str(input_file),
            "-osdf", "-O", str(output_file),
            "--gen3d",
            "--conformer",
            "--nconf", str(min(max_stereoisomers, 1))
        ]
        
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            logger.warning(f"Stereoisomer enumeration failed: {result.stderr}")
            # Fallback to 3D generation only
            fallback_command = [
                settings.OBABEL_PATH,
                "-isdf", str(input_file),
                "-osdf", "-O", str(output_file),
                "--gen3d"
            ]
            fallback_result = subprocess.run(fallback_command, capture_output=True, text=True)
            if fallback_result.returncode != 0:
                logger.warning(f"Stereoisomer fallback failed: {fallback_result.stderr}")
                # If fallback also fails, copy the original to the expected output location
                import shutil
                if Path(input_file).resolve() != Path(output_file).resolve():
                    shutil.copy2(input_file, output_file)
                    logger.info(f"Copied original file to stereoisomer output: {output_file}")
        
        return str(output_file)
    
    async def _final_minimization(self, input_file: str, job_dir: Path) -> str:
        """Final energy minimization of all states."""
        output_file = job_dir / "final_prepared_3d_library.sdf"
        
        command = [
            settings.OBABEL_PATH,
            "-isdf", str(input_file),
            "-osdf", "-O", str(output_file),
            "--minimize",
            "--ff", "MMFF94",
            "--steps", "500",
            "--cg",
            "--addpolarh"
        ]
        
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            logger.warning(f"Final minimization failed: {result.stderr}")
            # If minimization fails, copy the original to the expected output location
            import shutil
            if Path(input_file).resolve() != Path(output_file).resolve():
                shutil.copy2(input_file, output_file)
                logger.info(f"Copied original file to final minimization output: {output_file}")
            return str(output_file)
        
        return str(output_file)
    
    async def _convert_to_pdbqt(self, input_file: str, output_dir: Path) -> None:
        """Convert SDF to individual PDBQT files for docking."""
        command = [
            settings.OBABEL_PATH,
            "-isdf", str(input_file),
            "-opdbqt",
            "-m",
            "-O", str(output_dir / "mol_.pdbqt")
        ]
        
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"PDBQT conversion failed: {result.stderr}")
            raise subprocess.CalledProcessError(result.returncode, command)
    
    def _calculate_molecular_properties(self, mol) -> Dict[str, float]:
        """Calculate molecular properties using RDKit."""
        try:
            return {
                "molecular_weight": Descriptors.MolWt(mol),
                "logp": Descriptors.MolLogP(mol),
                "hbd": Descriptors.NumHDonors(mol),
                "hba": Descriptors.NumHAcceptors(mol),
                "tpsa": Descriptors.TPSA(mol),
                "rotatable_bonds": Descriptors.NumRotatableBonds(mol)
            }
        except Exception as e:
            logger.warning(f"Property calculation failed: {e}")
            return {}
    
    def _get_molecule_name(self, mol, mol_index: int, original_filename: Optional[str] = None) -> str:
        """Get molecule name with multiple fallback strategies."""
        # Strategy 1: Try to get name from molecule properties
        if mol and mol.HasProp('Name'):
            potential_name = mol.GetProp('Name').strip()
            # Skip CDX names and empty names
            if potential_name and not potential_name.lower().endswith('.cdx'):
                return potential_name

        # Strategy 2: Use original filename if available
        if original_filename:
            # Remove file extension and use as base name
            filename_base = Path(original_filename).stem
            # If there are multiple molecules in file, add index
            return f"{filename_base}_{mol_index}"

        # Strategy 3: Default naming
        return f"Molecule_{mol_index}"

    def _has_3d_coordinates(self, mol) -> bool:
        """Check if molecule has 3D coordinates."""
        if mol is None:
            return False

        # Check if molecule has a conformer with non-zero Z coordinates
        try:
            if mol.GetNumConformers() == 0:
                return False

            conf = mol.GetConformer()
            for i in range(mol.GetNumAtoms()):
                pos = conf.GetAtomPosition(i)
                if abs(pos.z) > 0.001:  # Non-zero Z coordinate indicates 3D
                    return True
            return False
        except Exception:
            return False

    def _count_molecules_in_sdf(self, sdf_file: str) -> int:
        """Count number of molecules in SDF file."""
        try:
            with open(sdf_file, 'r') as f:
                return f.read().count('$$$$')
        except Exception:
            return 0