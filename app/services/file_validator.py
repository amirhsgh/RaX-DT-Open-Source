"""File validation service for uploaded molecules and proteins."""

import os
from pathlib import Path
from typing import List, Optional, NamedTuple

from fastapi import UploadFile

from app.core.config import settings
from app.schemas.upload_schemas import FileValidationError


class ValidationResult(NamedTuple):
    """Result of file validation."""
    is_valid: bool
    errors: List[FileValidationError]
    molecule_count: Optional[int] = None
    file_info: Optional[dict] = None


class FileValidator:
    """Validator for uploaded molecular files."""
    
    SUPPORTED_LIGAND_FORMATS = {'.sdf', '.mol', '.mol2', '.smi', '.smiles'}
    SUPPORTED_PROTEIN_FORMATS = {'.pdbqt', '.pdb'}  # GNINA reads both directly
    
    async def validate_ligand_file(self, file: UploadFile) -> ValidationResult:
        """Validate an uploaded ligand file."""
        errors = []
        
        # Check file size
        content = await file.read()
        await file.seek(0)  # Reset file pointer
        
        if len(content) > settings.MAX_UPLOAD_SIZE:
            errors.append(FileValidationError(
                field="file_size",
                message=f"File size {len(content)} bytes exceeds maximum {settings.MAX_UPLOAD_SIZE} bytes"
            ))
        
        # Check file extension
        if not file.filename:
            errors.append(FileValidationError(
                field="filename",
                message="Filename is required"
            ))
            return ValidationResult(is_valid=False, errors=errors)
        
        file_extension = Path(file.filename).suffix.lower()
        if file_extension not in self.SUPPORTED_LIGAND_FORMATS:
            errors.append(FileValidationError(
                field="file_format",
                message=f"Unsupported file format '{file_extension}'. Supported formats: {', '.join(self.SUPPORTED_LIGAND_FORMATS)}"
            ))
        
        # Check MIME type if possible (skip if magic library not available)
        try:
            import magic
            mime_type = magic.from_buffer(content[:1024], mime=True)
            if not self._is_valid_ligand_mime_type(mime_type):
                errors.append(FileValidationError(
                    field="mime_type",
                    message=f"Invalid MIME type: {mime_type}"
                ))
        except (ImportError, Exception):
            pass  # magic library might not be available, skip MIME check
        
        # Validate file content and count molecules
        molecule_count = None
        if file_extension in {'.sdf', '.mol'}:
            molecule_count = self._count_sdf_molecules(content.decode('utf-8', errors='ignore'))
        elif file_extension in {'.smi', '.smiles'}:
            molecule_count = self._count_smiles_molecules(content.decode('utf-8', errors='ignore'))
        
        if molecule_count is not None:
            if molecule_count == 0:
                errors.append(FileValidationError(
                    field="content",
                    message="No valid molecules found in file"
                ))
            elif molecule_count > settings.MAX_MOLECULES_PER_JOB:
                errors.append(FileValidationError(
                    field="molecule_count",
                    message=f"File contains {molecule_count} molecules, maximum allowed is {settings.MAX_MOLECULES_PER_JOB}"
                ))
        
        file_info = {
            "filename": file.filename,
            "size": len(content),
            "format": file_extension,
            "molecule_count": molecule_count
        }
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            molecule_count=molecule_count,
            file_info=file_info
        )
    
    async def validate_protein_file(self, file: UploadFile) -> ValidationResult:
        """Validate an uploaded protein structure file."""
        errors = []
        
        # Check file size
        content = await file.read()
        await file.seek(0)  # Reset file pointer
        
        if len(content) > settings.MAX_UPLOAD_SIZE:
            errors.append(FileValidationError(
                field="file_size",
                message=f"File size {len(content)} bytes exceeds maximum {settings.MAX_UPLOAD_SIZE} bytes"
            ))
        
        # Check file extension
        if not file.filename:
            errors.append(FileValidationError(
                field="filename",
                message="Filename is required"
            ))
            return ValidationResult(is_valid=False, errors=errors)
        
        file_extension = Path(file.filename).suffix.lower()
        content_str = content.decode('utf-8', errors='ignore')

        # .pdb is accepted: GNINA reads it directly (--receptor takes PDB, and
        # the benchmark/redocking path docks receptor.pdb files unchanged), so
        # requiring users to pre-convert to PDBQT was rejecting structures the
        # engine handles natively.
        if file_extension not in self.SUPPORTED_PROTEIN_FORMATS:
            errors.append(FileValidationError(
                field="file_format",
                message=(
                    f"Unsupported protein format '{file_extension}'. "
                    f"Supported: {', '.join(sorted(self.SUPPORTED_PROTEIN_FORMATS))}."
                )
            ))

        if not errors and file_extension == '.pdbqt' and not self._validate_pdbqt_content(content_str):
            errors.append(FileValidationError(
                field="content",
                message="Invalid PDBQT file format. Please ensure your PDBQT file contains valid ATOM or HETATM records."
            ))

        if not errors and file_extension == '.pdb' and not self._validate_pdb_content(content_str):
            errors.append(FileValidationError(
                field="content",
                message="Invalid PDB file format. Please ensure your PDB file contains valid ATOM or HETATM records."
            ))

        file_info = {
            "filename": file.filename,
            "size": len(content),
            "format": file_extension,
            "atom_count": self._count_atoms(content_str) if file_extension in {'.pdb', '.pdbqt'} else None
        }
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            file_info=file_info
        )
    
    def _is_valid_ligand_mime_type(self, mime_type: str) -> bool:
        """Check if MIME type is valid for ligand files."""
        valid_types = {
            'text/plain',
            'application/octet-stream',
            'chemical/x-mdl-sdfile',
            'chemical/x-mdl-molfile'
        }
        return mime_type in valid_types
    
    def _count_sdf_molecules(self, content: str) -> int:
        """Count molecules in SDF file."""
        try:
            return content.count('$')
        except Exception:
            return 0
    
    def _count_smiles_molecules(self, content: str) -> int:
        """Count molecules in SMILES file."""
        try:
            lines = [line.strip() for line in content.split('\n') if line.strip()]
            return len(lines)
        except Exception:
            return 0
    
    def _validate_pdb_content(self, content: str) -> bool:
        """Validate PDB file content."""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            lines = content.split('\n')
            logger.info(f"🔍 PDB validation: File has {len(lines)} lines")
            
            # Show first few lines for debugging
            first_lines = [line.strip() for line in lines[:10] if line.strip()]
            logger.info(f"🔍 First 10 non-empty lines: {first_lines}")
            
            # Check for common PDB record types (more flexible validation)
            pdb_keywords = {
                'HEADER', 'TITLE', 'COMPND', 'SOURCE', 'KEYWDS', 'EXPDTA',
                'AUTHOR', 'REVDAT', 'JRNL', 'REMARK', 'SEQRES', 'HET',
                'HETNAM', 'HETSYN', 'FORMUL', 'HELIX', 'SHEET', 'SSBOND',
                'LINK', 'CISPEP', 'SITE', 'CRYST1', 'ORIGX1', 'ORIGX2',
                'ORIGX3', 'SCALE1', 'SCALE2', 'SCALE3', 'MTRIX1', 'MTRIX2',
                'MTRIX3', 'MODEL', 'ATOM', 'HETATM', 'ANISOU', 'TER',
                'ENDMDL', 'CONECT', 'MASTER', 'END'
            }
            
            # Look for PDB keywords in more lines (not just first 100)
            max_lines_to_check = min(500, len(lines))  # Check up to 500 lines
            
            pdb_records_found = 0
            found_keywords = []
            
            for line in lines[:max_lines_to_check]:
                line = line.strip()
                if not line:
                    continue
                    
                # Check if line starts with any PDB keyword
                record_type = line.split()[0] if line.split() else ""
                if record_type in pdb_keywords:
                    pdb_records_found += 1
                    found_keywords.append(record_type)
                    
                    # If we find ATOM or HETATM, it's definitely a valid PDB
                    if record_type in ('ATOM', 'HETATM'):
                        logger.info(f"✅ PDB validation: Found ATOM/HETATM record")
                        return True
            
            logger.info(f"🔍 PDB validation: Found {pdb_records_found} PDB keywords: {found_keywords}")
            
            # If we found at least 2 PDB record types, consider it valid
            # This handles PDB files that might not have ATOM records yet (just headers)
            is_valid = pdb_records_found >= 2
            logger.info(f"{'✅' if is_valid else '❌'} PDB validation result: {is_valid}")
            return is_valid
            
        except Exception as e:
            logger.error(f"❌ PDB validation error: {e}")
            return False
    
    def _validate_pdbqt_content(self, content: str) -> bool:
        """Validate PDBQT file content."""
        try:
            lines = content.split('\n')
            
            # Check for ATOM or HETATM records (essential for PDBQT)
            has_atom_records = False
            
            # Check more lines to be sure
            for line in lines[:200]:  # Check first 200 lines
                line = line.strip()
                if line.startswith(('ATOM', 'HETATM')):
                    has_atom_records = True
                    break
            
            # If no ATOM records found, check if it's at least a valid structure file
            if not has_atom_records:
                # Look for common PDB/PDBQT keywords
                pdb_keywords = {'REMARK', 'HEADER', 'TITLE', 'COMPND', 'SOURCE'}
                has_structure_info = any(
                    any(line.strip().startswith(keyword) for keyword in pdb_keywords)
                    for line in lines[:50]
                )
                return has_structure_info
            
            return has_atom_records
            
        except Exception:
            return False
    
    def _count_atoms(self, content: str) -> int:
        """Count atoms in PDB/PDBQT file."""
        try:
            lines = content.split('\n')
            return sum(1 for line in lines if line.startswith(('ATOM', 'HETATM')))
        except Exception:
            return 0