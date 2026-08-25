import os
import tempfile
import zipfile
import shutil
import subprocess
from pathlib import Path
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse, Response
import logging
from Bio.PDB import PDBParser, PDBIO, Select, MMCIFParser
from rdkit import Chem
from rdkit.Chem import AllChem

# Logger
logger = logging.getLogger(__name__)

try:
    import pymol2
    from pymol import cmd
    PYMOL_AVAILABLE = True
    logger.info("PyMOL is available")
except ImportError:
    PYMOL_AVAILABLE = False
    logger.warning("PyMOL not available, using BioPython fallback")
router = APIRouter()

STANDARD_AMINO_ACIDS = {
    'ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE',
    'LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL'
}

def parse_structure_file(file_path):
    """
    Parse structure file (PDB or CIF) and return Bio.PDB structure object
    """
    file_path_str = str(file_path)
    structure_id = "structure"

    if file_path_str.lower().endswith('.cif'):
        parser = MMCIFParser(QUIET=True)
        structure = parser.get_structure(structure_id, file_path_str)
    else:  # assume PDB format
        parser = PDBParser(QUIET=True)
        structure = parser.get_structure(structure_id, file_path_str)

    return structure

class ProteinSelect(Select):
    def __init__(self, keep_residues=None):
        self.keep_residues = keep_residues or set()
    def accept_residue(self, residue):
        # Only keep standard amino acids (removes ligands, water, etc.)
        return residue.get_resname() in STANDARD_AMINO_ACIDS

def pymol_structure_cleaner(input_file_path: str, output_protein_path: str, output_ligand_path: str, ligand_resn: str = ""):
    """
    Clean structure file (PDB or CIF) using PyMOL:
    1. Remove water molecules
    2. Remove non-protein residues (except specified ligand)
    3. Extract all ligands separately to SDF
    4. Add hydrogens to protein
    """
    try:
        # پاک کردن سشن قبلی PyMOL
        cmd.reinitialize()

        # بارگذاری پروتئین
        cmd.load(str(input_file_path), "original")
        logger.info(f"Loaded structure file: {input_file_path}")

        # پیدا کردن رزیدوهای غیرپروتئینی
        model = cmd.get_model("all")
        non_protein_residues = set()

        for atom in model.atom:
            if atom.resn not in STANDARD_AMINO_ACIDS and atom.resn not in ['HOH', 'WAT']:
                non_protein_residues.add(atom.resn)

        logger.info(f"Non-protein residues found: {non_protein_residues}")

        # حذف مولکول‌های آب
        cmd.remove("resn HOH")
        cmd.remove("resn WAT")
        water_count = cmd.count_atoms("resn HOH or resn WAT")
        logger.info(f"Water molecules remaining: {water_count}")

        # استخراج همه لیگاندها
        ligand_extracted = False
        if non_protein_residues:
            # اگر ligand_resn مشخص شده، فقط آن را نگه دار، وگرنه همه را
            if ligand_resn and ligand_resn in non_protein_residues:
                target_ligands = [ligand_resn]
                logger.info(f"Extracting specific ligand: {ligand_resn}")
            else:
                target_ligands = list(non_protein_residues)
                logger.info(f"Extracting all ligands: {target_ligands}")

            # انتخاب همه لیگاندهای مورد نظر
            ligand_selection = " or ".join([f"resn {resn}" for resn in target_ligands])
            cmd.select("all_ligands", ligand_selection)
            ligand_count = cmd.count_atoms("all_ligands")

            if ligand_count > 0:
                cmd.create("ligands_clean", "all_ligands")
                # ذخیره به فرمت SDF
                cmd.save(str(output_ligand_path), "ligands_clean")
                ligand_extracted = True
                logger.info(f"Ligands extracted with {ligand_count} atoms to SDF format")
            else:
                logger.warning(f"No atoms found for ligands")

        # حذف همه رزیدوهای غیرپروتئینی (شامل لیگاند)
        for resn in non_protein_residues:
            cmd.remove(f"resn {resn}")
            logger.info(f"Removed non-protein residue: {resn}")

        # اضافه کردن هیدروژن به پروتئین
        cmd.h_add("all")
        logger.info("Added hydrogens to protein")

        # ذخیره پروتئین تمیز شده
        cmd.save(str(output_protein_path), "all")
        logger.info(f"Cleaned protein saved to: {output_protein_path}")

        # پاک کردن سشن PyMOL
        cmd.reinitialize()

        return ligand_extracted

    except Exception as e:
        logger.error(f"Error in PyMOL processing: {str(e)}")
        cmd.reinitialize()
        raise RuntimeError(f"PyMOL processing failed: {str(e)}")

def clean_protein_and_extract_ligand_pymol(input_file, output_protein, output_ligand, ligand_resn=""):
    """استفاده از PyMOL برای پردازش"""
    return pymol_structure_cleaner(str(input_file), str(output_protein), str(output_ligand), ligand_resn)

def clean_protein_and_extract_ligand_enhanced(input_file, output_protein, output_ligand_sdf, ligand_resn=""):
    """
    Enhanced protein cleaning and ligand extraction with SDF output
    تمیز کردن پروتئین و استخراج همه لیگاندها به فرمت SDF
    """
    try:
        structure = parse_structure_file(input_file)

        non_protein_residues = set()
        all_ligand_residues = []

        for residue in structure.get_residues():
            if residue.get_resname() not in STANDARD_AMINO_ACIDS and residue.get_resname() not in ['HOH', 'WAT']:
                non_protein_residues.add(residue.get_resname())
                all_ligand_residues.append(residue)

        logger.info(f"Found non-protein residues: {non_protein_residues}")
        logger.info(f"Found {len(all_ligand_residues)} ligand residues total")

        ligand_extracted = False

        # تعیین کدام ligand ها را استخراج کنیم
        if ligand_resn and ligand_resn in non_protein_residues:
            # فقط ligand مشخص شده
            target_residues = [r for r in all_ligand_residues if r.get_resname() == ligand_resn]
            logger.info(f"Extracting specific ligand: {ligand_resn}")
        else:
            # همه ligand ها
            target_residues = all_ligand_residues
            logger.info(f"Extracting all ligands: {list(non_protein_residues)}")

        if target_residues:
            # تبدیل residue های BioPython به RDKit molecules
            molecules = []

            for residue in target_residues:
                try:
                    # ایجاد temporary PDB برای هر residue
                    from Bio.PDB import Structure, Model, Chain
                    temp_structure = Structure.Structure("temp")
                    temp_model = Model.Model(0)
                    temp_chain = Chain.Chain("L")

                    # کپی کردن residue
                    new_residue = residue.copy()
                    new_residue.detach_parent()
                    temp_chain.add(new_residue)
                    temp_model.add(temp_chain)
                    temp_structure.add(temp_model)

                    # ذخیره موقت
                    temp_pdb = str(output_ligand_sdf).replace('.sdf', f'_temp_{residue.get_resname()}.pdb')
                    io = PDBIO()
                    io.set_structure(temp_structure)
                    io.save(temp_pdb)

                    # خواندن با RDKit
                    mol = Chem.MolFromPDBFile(temp_pdb, removeHs=False)
                    if mol is not None:
                        # اضافه کردن هیدروژن
                        mol = Chem.AddHs(mol)

                        # تنظیم properties
                        mol.SetProp("_Name", residue.get_resname())
                        mol.SetProp("ResidueID", str(residue.get_id()[1]))
                        mol.SetProp("ChainID", residue.get_parent().get_id())

                        molecules.append(mol)
                        logger.info(f"Successfully processed ligand: {residue.get_resname()}")

                    # حذف فایل موقت
                    if os.path.exists(temp_pdb):
                        os.unlink(temp_pdb)

                except Exception as residue_error:
                    logger.warning(f"Failed to process residue {residue.get_resname()}: {str(residue_error)}")
                    continue

            # نوشتن همه molecules به SDF
            if molecules:
                writer = Chem.SDWriter(str(output_ligand_sdf))
                for mol in molecules:
                    writer.write(mol)
                writer.close()

                ligand_extracted = True
                logger.info(f"Successfully extracted {len(molecules)} ligand(s) to SDF: {output_ligand_sdf}")

                # بررسی فایل SDF
                if os.path.exists(str(output_ligand_sdf)) and os.path.getsize(str(output_ligand_sdf)) > 0:
                    logger.info(f"SDF file size: {os.path.getsize(str(output_ligand_sdf))} bytes")
                else:
                    logger.error("SDF file was not created properly")
                    ligand_extracted = False
            else:
                logger.warning("No valid molecules could be extracted")

        # ذخیره پروتئین تمیز شده
        io = PDBIO()
        io.set_structure(structure)
        io.save(str(output_protein), ProteinSelect())
        logger.info(f"Cleaned protein saved to: {output_protein}")

        return ligand_extracted

    except Exception as e:
        logger.error(f"Error in enhanced protein cleaning: {str(e)}")
        raise RuntimeError(f"Enhanced protein/ligand preparation failed: {str(e)}")

def clean_protein_and_extract_ligand(input_file, output_protein, output_ligand, ligand_resn=""):
    try:
        # Convert Path objects to strings for BioPython compatibility
        structure = parse_structure_file(input_file)

        non_protein_residues = set()
        for residue in structure.get_residues():
            if residue.get_resname() not in STANDARD_AMINO_ACIDS and residue.get_resname() != "HOH":
                non_protein_residues.add(residue.get_resname())

        logger.info(f"Found non-protein residues: {non_protein_residues}")
        logger.info(f"Looking for ligand residue: {ligand_resn}")

        ligand_extracted = False

        # اگر ligand_resn مشخص نشده یا پیدا نشده، از اولین non-protein residue استفاده کن
        actual_ligand_resn = ligand_resn
        if not ligand_resn or ligand_resn not in non_protein_residues:
            if non_protein_residues:
                actual_ligand_resn = list(non_protein_residues)[0]
                logger.info(f"Using first available residue as ligand: {actual_ligand_resn}")
            else:
                logger.warning("No non-protein residues found in structure")
                actual_ligand_resn = None

        if actual_ligand_resn and actual_ligand_resn in non_protein_residues:
            ligand_residues = [r for r in structure.get_residues() if r.get_resname() == actual_ligand_resn]
            if ligand_residues:
                # Create a new structure containing only the ligand residue
                from Bio.PDB import Structure, Model, Chain
                ligand_structure = Structure.Structure("ligand")
                ligand_model = Model.Model(0)
                ligand_chain = Chain.Chain("L")

                # Add the ligand residue to the new structure
                ligand_residue = ligand_residues[0]
                # Create a copy of the residue
                new_residue = ligand_residue.copy()
                new_residue.detach_parent()
                ligand_chain.add(new_residue)
                ligand_model.add(ligand_chain)
                ligand_structure.add(ligand_model)

                io = PDBIO()
                io.set_structure(ligand_structure)
                io.save(str(output_ligand))

                # بررسی که فایل ligand ایجاد شده
                if os.path.exists(str(output_ligand)) and os.path.getsize(str(output_ligand)) > 0:
                    ligand_extracted = True
                    logger.info(f"Ligand extracted successfully to: {output_ligand} (size: {os.path.getsize(str(output_ligand))} bytes)")

                    # بررسی محتوای فایل
                    with open(str(output_ligand), 'r') as f:
                        content = f.read()
                        if not content.strip():
                            logger.error("Ligand file is empty")
                            ligand_extracted = False
                        else:
                            logger.info(f"Ligand file has {len(content.splitlines())} lines")

                    # اضافه کردن هیدروژن و بهینه سازی
                    try:
                        ligand_mol = Chem.MolFromPDBFile(str(output_ligand), removeHs=False)
                        if ligand_mol is not None:
                            ligand_mol = Chem.AddHs(ligand_mol)
                            AllChem.EmbedMolecule(ligand_mol)
                            AllChem.UFFOptimizeMolecule(ligand_mol)
                            Chem.MolToPDBFile(ligand_mol, str(output_ligand))
                            logger.info(f"Ligand optimized with RDKit")
                    except Exception as rdkit_error:
                        logger.warning(f"RDKit processing failed for ligand, using basic structure: {str(rdkit_error)}")
                else:
                    logger.error(f"Failed to create ligand file: {output_ligand}")
                    ligand_extracted = False

        # ذخیره پروتئین تمیز شده (بدون لیگاند)
        io = PDBIO()
        io.set_structure(structure)
        # فقط پروتئین‌ها را نگه دار، لیگاند را حذف کن
        io.save(str(output_protein), ProteinSelect())

        return ligand_extracted
    except Exception as e:
        logger.error(f"Error cleaning protein or extracting ligand: {str(e)}")
        raise RuntimeError(f"Protein/Ligand preparation failed: {str(e)}")

def prepare_ligand_simple(input_pdb, output_pdbqt):
    """تهیه ligand PDBQT با تبدیل ساده PDB به PDBQT"""
    try:
        # بررسی وجود فایل ورودی
        if not os.path.exists(str(input_pdb)):
            raise FileNotFoundError(f"Input file not found: {input_pdb}")

        # خواندن فایل PDB
        with open(str(input_pdb), 'r') as f:
            pdb_content = f.read()

        # تبدیل ساده PDB به PDBQT
        pdbqt_lines = []
        for line in pdb_content.split('\n'):
            if line.startswith(('ATOM', 'HETATM')):
                # تبدیل HETATM به ATOM برای ligand
                if line.startswith('HETATM'):
                    line = 'ATOM  ' + line[6:]

                # اضافه کردن partial charge و atom type (basic)
                atom_type = line[76:78].strip()
                if not atom_type:
                    # استخراج نوع اتم از نام اتم
                    atom_name = line[12:16].strip()
                    if atom_name.startswith('C'):
                        atom_type = 'C'
                    elif atom_name.startswith('N'):
                        atom_type = 'N'
                    elif atom_name.startswith('O'):
                        atom_type = 'O'
                    elif atom_name.startswith('S'):
                        atom_type = 'S'
                    elif atom_name.startswith('P'):
                        atom_type = 'P'
                    else:
                        atom_type = 'C'  # پیش‌فرض

                # فرمت PDBQT: اضافه کردن partial charge و atom type
                if len(line) >= 78:
                    # اگر طول خط کافی است، فقط atom type را اضافه کن
                    pdbqt_line = line[:78] + f"{atom_type:>2}"
                else:
                    # اگر خط کوتاه است، آن را تکمیل کن
                    pdbqt_line = line.ljust(78) + f"{atom_type:>2}"

                pdbqt_lines.append(pdbqt_line)

            elif line.startswith(('END', 'CONECT', 'MASTER')):
                # نگه داشتن خطوط پایانی
                pdbqt_lines.append(line)

        # اضافه کردن ROOT و ENDROOT برای ligand
        final_pdbqt = ['ROOT'] + pdbqt_lines + ['ENDROOT', 'TORSDOF 0']

        # نوشتن فایل PDBQT
        with open(str(output_pdbqt), 'w') as f:
            f.write('\n'.join(final_pdbqt))

        logger.info(f"Successfully created PDBQT file with simple conversion: {output_pdbqt}")

    except Exception as e:
        logger.error(f"Error preparing PDBQT with simple conversion: {str(e)}")
        raise RuntimeError(f"Simple PDBQT preparation failed: {str(e)}")

def prepare_ligand_with_obabel(input_pdb, output_pdbqt):
    """تهیه ligand PDBQT با OpenBabel به عنوان جایگزین MGLTools"""
    try:
        # بررسی وجود فایل ورودی
        if not os.path.exists(str(input_pdb)):
            raise FileNotFoundError(f"Input file not found: {input_pdb}")

        # استفاده از obabel برای تبدیل PDB به PDBQT
        cmd_list = [
            "obabel",
            str(input_pdb),
            "-O", str(output_pdbqt),
            "--partialcharge", "gasteiger",
            "--gen3d"
        ]

        logger.info(f"Running obabel command: {' '.join(cmd_list)}")
        result = subprocess.run(cmd_list, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"OpenBabel stderr: {result.stderr}")
            logger.error(f"OpenBabel stdout: {result.stdout}")
            raise RuntimeError(f"OpenBabel prepare failed: {result.stderr}")

        # بررسی که فایل خروجی ایجاد شده
        if not os.path.exists(str(output_pdbqt)):
            raise RuntimeError(f"Output PDBQT file was not created: {output_pdbqt}")

        logger.info(f"Successfully created PDBQT file with OpenBabel: {output_pdbqt}")

    except Exception as e:
        logger.error(f"Error preparing PDBQT with OpenBabel: {str(e)}")
        raise RuntimeError(f"OpenBabel PDBQT preparation failed: {str(e)}")

def windows_path_to_wsl(windows_path):
    """
    تبدیل Windows path به WSL path
    مثال: F:\\code\\BioForge\\data\\results -> /mnt/f/code/BioForge/data/results
    """
    path_str = str(windows_path)
    # تبدیل به absolute path
    abs_path = os.path.abspath(path_str)

    # اگر در Windows است (مثلا F:\...)
    if abs_path[1:3] == ':\\':
        drive = abs_path[0].lower()
        rest = abs_path[3:].replace('\\', '/')
        wsl_path = f"/mnt/{drive}/{rest}"
        return wsl_path

    # اگر قبلا WSL path است
    return abs_path.replace('\\', '/')

def prepare_with_mgltools(input_pdb, output_pdbqt, is_protein=True):
    try:
        # بررسی وجود فایل ورودی
        if not os.path.exists(str(input_pdb)):
            raise FileNotFoundError(f"Input file not found: {input_pdb}")

        # تبدیل path های Windows به WSL
        input_wsl = windows_path_to_wsl(input_pdb)
        output_wsl = windows_path_to_wsl(output_pdbqt)

        if is_protein:
            script = "/home/amqa/MGLTools/MGLToolsPckgs/AutoDockTools/Utilities24/prepare_receptor4.py"
            args = ["-r", input_wsl, "-o", output_wsl, "-A", "hydrogens", "-U", "nphs_lps"]
        else:
            script = "/home/amqa/MGLTools/MGLToolsPckgs/AutoDockTools/Utilities24/prepare_ligand4.py"
            args = ["-l", input_wsl, "-o", output_wsl, "-A", "hydrogens"]

        if not os.path.exists(script):
            raise FileNotFoundError(f"MGLTools script not found: {script}")

        cmd_list = ["pythonsh", script] + args
        logger.info(f"Running MGLTools command: {' '.join(cmd_list)}")

        result = subprocess.run(cmd_list, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"MGLTools stderr: {result.stderr}")
            logger.error(f"MGLTools stdout: {result.stdout}")
            raise RuntimeError(f"MGLTools prepare failed: {result.stderr}")

        # بررسی که فایل خروجی ایجاد شده
        if not os.path.exists(str(output_pdbqt)):
            raise RuntimeError(f"Output PDBQT file was not created: {output_pdbqt}")

        logger.info(f"Successfully created PDBQT file: {output_pdbqt}")

    except Exception as e:
        logger.error(f"Error preparing PDBQT with MGLTools: {str(e)}")
        raise RuntimeError(f"MGLTools PDBQT preparation failed: {str(e)}")

@router.post("/predict-binding-sites")
async def predict_binding_sites_with_p2rank(
    protein_file: UploadFile = File(...),
    output_name: str = Form("predicted")
):
    """
    پیش‌بینی جایگاه‌های اتصال با استفاده از P2Rank
    Predict binding sites using P2Rank algorithm
    """
    from app.core.config import settings
    import json
    import csv

    allowed_extensions = [".pdb", ".cif"]
    file_extension = None
    filename_lower = protein_file.filename.lower()

    for ext in allowed_extensions:
        if filename_lower.endswith(ext):
            file_extension = ext
            break

    if not file_extension:
        raise HTTPException(status_code=400, detail="File must be PDB or CIF format")

    # ساخت پوشه کاری
    import time
    timestamp = int(time.time() * 1000)
    work_dir = Path(settings.RESULTS_DIR) / f"p2rank_{timestamp}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # ذخیره فایل آپلود شده
        input_file = work_dir / f"protein{file_extension}"
        with open(input_file, "wb") as f:
            f.write(await protein_file.read())

        logger.info(f"Starting P2Rank binding site prediction for: {protein_file.filename}")

        # اجرای P2Rank
        prank_cmd = getattr(settings, 'PRANK_PATH', 'prank')

        # تبدیل به مسیر مطلق و سپس به WSL path
        input_file_abs = str(input_file.absolute())
        work_dir_abs = str(work_dir.absolute())

        # تبدیل به WSL path در صورتی که در Windows هستیم
        input_wsl = windows_path_to_wsl(input_file_abs)
        output_wsl = windows_path_to_wsl(work_dir_abs)

        cmd_list = [
            prank_cmd,
            "predict",
            "-f", input_wsl,
            "-o", output_wsl,
            "-threads", "4"
        ]

        logger.info(f"Running P2Rank command: {' '.join(cmd_list)}")
        logger.info(f"Input file (WSL): {input_wsl}")
        logger.info(f"Output dir (WSL): {output_wsl}")

        # اجرا بدون تغییر cwd
        result = subprocess.run(cmd_list, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"P2Rank stderr: {result.stderr}")
            logger.error(f"P2Rank stdout: {result.stdout}")
            raise RuntimeError(f"P2Rank prediction failed: {result.stderr}")

        logger.info(f"P2Rank stdout: {result.stdout}")

        # پیدا کردن فایل‌های خروجی P2Rank
        # P2Rank معمولاً فایل‌ها را در پوشه‌ای مثل protein.pdb_predictions می‌سازد
        prediction_dir = None
        for item in work_dir.iterdir():
            if item.is_dir() and "predictions" in item.name.lower():
                prediction_dir = item
                break

        if not prediction_dir:
            # بررسی اگر فایل‌ها مستقیم در work_dir هستند
            prediction_dir = work_dir

        logger.info(f"Looking for P2Rank outputs in: {prediction_dir}")

        # خواندن فایل CSV نتایج
        predictions_data = []
        csv_file = None

        # جستجوی فایل CSV
        for file in prediction_dir.rglob("*.csv"):
            if "predictions" in file.name.lower():
                csv_file = file
                break

        if csv_file and csv_file.exists():
            logger.info(f"Found predictions CSV: {csv_file}")
            with open(csv_file, 'r') as f:
                csv_reader = csv.DictReader(f)
                for row in csv_reader:
                    predictions_data.append(row)
            logger.info(f"Loaded {len(predictions_data)} predicted binding sites")

        # ساخت ZIP خروجی
        zip_file_path = work_dir / f"{output_name}_p2rank_results.zip"
        with zipfile.ZipFile(str(zip_file_path), 'w', zipfile.ZIP_DEFLATED) as zipf:
            # اضافه کردن همه فایل‌های خروجی P2Rank
            for file in prediction_dir.rglob("*"):
                if file.is_file():
                    arcname = file.relative_to(work_dir)
                    zipf.write(str(file), str(arcname))
                    logger.info(f"Added to ZIP: {arcname}")

            # اضافه کردن فایل JSON با نتایج پارس شده
            if predictions_data:
                json_content = json.dumps({
                    "protein_file": protein_file.filename,
                    "predicted_sites": predictions_data,
                    "total_sites": len(predictions_data)
                }, indent=2)
                zipf.writestr("predictions_summary.json", json_content)

            # اضافه کردن README
            readme_content = f"""# P2Rank Binding Site Prediction Results

This archive contains the binding site predictions for: {protein_file.filename}

## Files:
- *.csv: Predicted binding sites with scores
- *.pdb: Visualizations of predicted binding sites
- predictions_summary.json: Parsed predictions in JSON format

## Predicted Sites:
Total sites found: {len(predictions_data)}

"""
            if predictions_data:
                readme_content += "\nTop 5 Binding Sites (by score):\n"
                sorted_predictions = sorted(predictions_data,
                    key=lambda x: float(x.get('score', 0)), reverse=True)[:5]
                for i, site in enumerate(sorted_predictions, 1):
                    readme_content += f"{i}. Site {site.get('name', 'N/A')}: Score {site.get('score', 'N/A')}\n"

            readme_content += f"""
Generated on: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
            zipf.writestr("README.txt", readme_content)

        # بررسی ZIP
        if not zip_file_path.exists():
            raise HTTPException(status_code=500, detail="ZIP file was not created")

        zip_size = zip_file_path.stat().st_size
        if zip_size == 0:
            raise HTTPException(status_code=500, detail="ZIP file is empty")

        logger.info(f"ZIP file created successfully: {zip_file_path} (size: {zip_size} bytes)")
        logger.info(f"✅ P2Rank results saved in: {work_dir}")

        # خواندن و ارسال ZIP
        with open(str(zip_file_path), "rb") as f:
            zip_content = f.read()

        return Response(
            content=zip_content,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={output_name}_p2rank_results.zip"}
        )

    except Exception as e:
        logger.error(f"Error in P2Rank prediction: {str(e)}")
        if work_dir.exists():
            try:
                shutil.rmtree(work_dir)
                logger.info(f"Cleaned up failed prediction directory: {work_dir}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup directory: {cleanup_error}")
        raise HTTPException(status_code=500, detail=f"P2Rank prediction failed: {str(e)}")


@router.post("/prepare")
async def prepare_protein_and_ligand(
    protein_file: UploadFile = File(...),
    ligand_resn: str = Form("LIG"),
    output_name: str = Form("prepared")
):
    from app.core.config import settings

    allowed_extensions = [".pdb", ".cif"]
    file_extension = None
    filename_lower = protein_file.filename.lower()

    for ext in allowed_extensions:
        if filename_lower.endswith(ext):
            file_extension = ext
            break

    if not file_extension:
        raise HTTPException(status_code=400, detail="File must be PDB or CIF format")

    # استفاده از پوشه RESULTS_DIR به جای /tmp
    # ساخت یک پوشه یونیک برای این درخواست
    import time
    timestamp = int(time.time() * 1000)
    work_dir = Path(settings.RESULTS_DIR) / f"protein_prep_{timestamp}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Use original extension for input file
        input_file = work_dir / f"input{file_extension}"

        try:
            # ذخیره فایل آپلود شده
            with open(input_file, "wb") as f:
                f.write(await protein_file.read())

            protein_clean_pdb = work_dir / f"{output_name}_protein_clean.pdb"
            ligand_clean_sdf = work_dir / f"{output_name}_ligands.sdf"

            # تمیز کردن پروتئین و استخراج لیگاند
            logger.info(f"Starting protein cleaning and ligand extraction for residue: {ligand_resn}")

            if PYMOL_AVAILABLE:
                logger.info("Using PyMOL for protein cleaning and ligand extraction")
                ligand_extracted = clean_protein_and_extract_ligand_pymol(
                    input_file, protein_clean_pdb, ligand_clean_sdf, ligand_resn
                )
            else:
                logger.info("Using enhanced BioPython + RDKit for protein cleaning and SDF extraction")
                ligand_extracted = clean_protein_and_extract_ligand_enhanced(
                    input_file, protein_clean_pdb, ligand_clean_sdf, ligand_resn
                )
            logger.info(f"Ligand extraction result: {ligand_extracted}")

            # بررسی فایل‌های ایجاد شده
            logger.info(f"Protein file exists: {protein_clean_pdb.exists()}")
            if ligand_extracted:
                logger.info(f"Ligand file exists: {ligand_clean_sdf.exists()}")

            # آماده سازی پروتئین با MGLTools + Kollman charges
            protein_pdbqt = work_dir / f"{output_name}_protein.pdbqt"
            prepare_with_mgltools(protein_clean_pdb, protein_pdbqt, is_protein=True)

            # برای autobox فقط ligand در فرمت SDF نیاز داریم (نه PDBQT)
            # ولی اگر کاربر بخواهد می‌توانیم PDBQT هم تولید کنیم
            ligand_pdbqt = None
            if ligand_extracted and ligand_clean_sdf.exists():
                # اگر فایل SDF است، برای PDBQT باید ابتدا به PDB تبدیل کنیم
                if str(ligand_clean_sdf).endswith('.sdf'):
                    # برای PDBQT نیاز به PDB داریم، پس تبدیل کنیم
                    ligand_temp_pdb = work_dir / f"{output_name}_ligand_temp.pdb"
                    try:
                        # خواندن SDF و تبدیل به PDB
                        suppl = Chem.SDMolSupplier(str(ligand_clean_sdf), removeHs=False)
                        mol = next(suppl)
                        if mol is not None:
                            Chem.MolToPDBFile(mol, str(ligand_temp_pdb))
                            logger.info("Converted SDF to temporary PDB for PDBQT generation")

                            # حالا PDBQT تولید کن
                            ligand_pdbqt = work_dir / f"{output_name}_ligand.pdbqt"
                            logger.info(f"Preparing ligand PDBQT from temporary PDB")
                            try:
                                # روش ساده برای تولید PDBQT
                                prepare_ligand_simple(ligand_temp_pdb, ligand_pdbqt)
                            except Exception as pdbqt_error:
                                logger.warning(f"PDBQT generation failed: {str(pdbqt_error)}")
                                ligand_pdbqt = None
                        else:
                            logger.warning("Could not read molecule from SDF for PDBQT generation")
                    except Exception as sdf_error:
                        logger.warning(f"SDF to PDB conversion failed: {str(sdf_error)}")
                else:
                    # اگر فایل PDB است
                    ligand_pdbqt = work_dir / f"{output_name}_ligand.pdbqt"
                    logger.info(f"Preparing ligand PDBQT from: {ligand_clean_sdf}")
                    try:
                        prepare_ligand_simple(ligand_clean_sdf, ligand_pdbqt)
                    except Exception as pdbqt_error:
                        logger.warning(f"PDBQT generation failed: {str(pdbqt_error)}")
                        ligand_pdbqt = None

            # ساخت ZIP خروجی
            zip_file_path = work_dir / f"{output_name}_prepared.zip"
            with zipfile.ZipFile(str(zip_file_path), 'w', zipfile.ZIP_DEFLATED) as zipf:
                # اضافه کردن فایل پروتئین
                if protein_clean_pdb.exists():
                    zipf.write(str(protein_clean_pdb), protein_clean_pdb.name)
                    logger.info(f"Added protein PDB to ZIP: {protein_clean_pdb.name}")

                if protein_pdbqt.exists():
                    zipf.write(str(protein_pdbqt), protein_pdbqt.name)
                    logger.info(f"Added protein PDBQT to ZIP: {protein_pdbqt.name}")

                # اضافه کردن فایل‌های لیگاند
                if ligand_extracted:
                    if ligand_clean_sdf.exists():
                        zipf.write(str(ligand_clean_sdf), ligand_clean_sdf.name)
                        logger.info(f"Added ligand SDF to ZIP: {ligand_clean_sdf.name}")

                    if ligand_pdbqt is not None and ligand_pdbqt.exists():
                        zipf.write(str(ligand_pdbqt), ligand_pdbqt.name)
                        logger.info(f"Added ligand PDBQT to ZIP: {ligand_pdbqt.name}")

                # اضافه کردن فایل README با توضیحات
                readme_content = f"""# Protein Preparation Results

This archive contains the following files:

## Protein Files:
- {protein_clean_pdb.name}: Cleaned protein structure (PDB format)
- {protein_pdbqt.name}: Protein ready for docking (PDBQT format)

## Ligand Files:
"""
                if ligand_extracted:
                    readme_content += f"- {ligand_clean_sdf.name}: Ligand(s) for autobox (SDF format) - Contains all ligands for binding site definition\n"
                    if ligand_pdbqt is not None and ligand_pdbqt.exists():
                        readme_content += f"- {ligand_pdbqt.name}: Ligand for docking (PDBQT format)\n"
                else:
                    readme_content += "- No ligands were extracted\n"

                readme_content += f"""
## Usage Notes:
- Use the SDF file for defining binding sites (autobox) in GNINA
- The SDF contains all relevant ligands to ensure proper binding site coverage
- Use PDBQT files for molecular docking with AutoDock Vina/GNINA

Generated on: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
                zipf.writestr("README.txt", readme_content)
                logger.info("Added README.txt to ZIP")

            # بررسی که فایل ZIP ساخته شده
            if not zip_file_path.exists():
                raise HTTPException(status_code=500, detail="ZIP file was not created")

            zip_size = zip_file_path.stat().st_size
            if zip_size == 0:
                raise HTTPException(status_code=500, detail="ZIP file is empty")

            logger.info(f"ZIP file created successfully: {zip_file_path} (size: {zip_size} bytes)")

            # خواندن فایل ZIP به memory و ارسال آن
            with open(str(zip_file_path), "rb") as f:
                zip_content = f.read()

            logger.info(f"ZIP content read: {len(zip_content)} bytes")
            logger.info(f"✅ Files saved permanently in: {work_dir}")

            return Response(
                content=zip_content,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename={output_name}_prepared.zip"}
            )

        except Exception as e:
            logger.error(f"Error in /prepare endpoint: {str(e)}")
            # در صورت بروز خطا، پوشه را پاک کن
            if work_dir.exists():
                try:
                    shutil.rmtree(work_dir)
                    logger.info(f"Cleaned up failed preparation directory: {work_dir}")
                except Exception as cleanup_error:
                    logger.warning(f"Failed to cleanup directory: {cleanup_error}")
            raise HTTPException(status_code=500, detail=f"Protein preparation failed: {str(e)}")

    except Exception as outer_error:
        logger.error(f"Unexpected error in protein preparation: {str(outer_error)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(outer_error)}")
