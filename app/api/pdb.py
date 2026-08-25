"""
PDB API endpoints for protein structure database integration.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import logging
import os
import asyncio

from app.services.pdb_service import pdb_service
from app.api.auth import get_current_user_optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pdb", tags=["pdb"])


# Pydantic models for request/response
class ProteinSearchRequest(BaseModel):
    protein_name: str = Field(..., description="Name of the protein to search for")
    max_results: int = Field(50, ge=1, le=200, description="Maximum number of results")


class AdvancedSearchRequest(BaseModel):
    protein_name: Optional[str] = Field(None, description="Protein name (optional)")
    resolution_max: Optional[float] = Field(None, ge=0.5, le=10.0, description="Maximum resolution in Å")
    resolution_min: Optional[float] = Field(None, ge=0.5, le=10.0, description="Minimum resolution in Å")
    exp_method: Optional[str] = Field(None, description="Experimental method (X-RAY, NMR, CRYO-EM, etc.)")
    release_year_min: Optional[int] = Field(None, ge=1970, le=2030, description="Minimum release year")
    release_year_max: Optional[int] = Field(None, ge=1970, le=2030, description="Maximum release year")
    organism: Optional[str] = Field(None, description="Source organism")
    max_results: int = Field(100, ge=1, le=500, description="Maximum number of results")


class StructureDownloadRequest(BaseModel):
    pdb_id: str = Field(..., description="PDB ID to download")
    format_type: str = Field("pdb", description="File format (pdb, cif, mmcif, xml, fasta, pdbqt)")


class StructureComparisonRequest(BaseModel):
    pdb_ids: List[str] = Field(..., min_items=2, max_items=10, description="List of PDB IDs to compare")


class SimilaritySearchRequest(BaseModel):
    pdb_id: str = Field(..., description="Reference PDB ID")
    similarity_cutoff: float = Field(0.9, ge=0.1, le=1.0, description="Similarity cutoff")
    max_results: int = Field(20, ge=1, le=100, description="Maximum number of results")


def get_user_id(request: Request, current_user: Optional[Dict[str, Any]] = None) -> str:
    """Get user ID for rate limiting, fallback to IP address."""
    if current_user:
        return f"user_{current_user.get('id', 'unknown')}"

    # Use IP address for anonymous users
    client_ip = request.client.host if request.client else "unknown"
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()

    return f"ip_{client_ip}"


@router.post("/search/protein", summary="Search structures by protein name")
async def search_by_protein_name(
    request: Request,
    search_request: ProteinSearchRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Search for all experimental structures of a protein by name.

    Returns structures ranked by quality score (resolution, R-factor, etc.).
    """
    try:
        user_id = get_user_id(request, current_user)

        result = await pdb_service.search_by_protein_name(
            protein_name=search_request.protein_name,
            max_results=search_request.max_results,
            user_id=user_id
        )

        if not result["success"]:
            raise HTTPException(status_code=404, detail=result.get("message", "Search failed"))

        return result

    except Exception as e:
        logger.error(f"Protein search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/search/advanced", summary="Advanced search with filters")
async def advanced_search(
    request: Request,
    search_request: AdvancedSearchRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Advanced search with multiple filters including resolution, experimental method,
    release date, and organism.
    """
    try:
        user_id = get_user_id(request, current_user)

        # Validate resolution range
        if (search_request.resolution_min and search_request.resolution_max and
            search_request.resolution_min > search_request.resolution_max):
            raise HTTPException(
                status_code=400,
                detail="Minimum resolution cannot be greater than maximum resolution"
            )

        # Validate year range
        if (search_request.release_year_min and search_request.release_year_max and
            search_request.release_year_min > search_request.release_year_max):
            raise HTTPException(
                status_code=400,
                detail="Minimum year cannot be greater than maximum year"
            )

        result = await pdb_service.advanced_search(
            protein_name=search_request.protein_name,
            resolution_max=search_request.resolution_max,
            resolution_min=search_request.resolution_min,
            exp_method=search_request.exp_method,
            release_year_min=search_request.release_year_min,
            release_year_max=search_request.release_year_max,
            organism=search_request.organism,
            max_results=search_request.max_results,
            user_id=user_id
        )

        if not result["success"]:
            raise HTTPException(status_code=404, detail=result.get("error", "Search failed"))

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Advanced search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/structure/{pdb_id}", summary="Get detailed structure information")
async def get_structure_info(
    request: Request,
    pdb_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """Get comprehensive information about a single PDB structure."""
    try:
        # Validate PDB ID format
        pdb_id = pdb_id.upper().strip()
        if len(pdb_id) != 4 or not pdb_id.isalnum():
            raise HTTPException(status_code=400, detail="PDB ID must be 4 alphanumeric characters")

        user_id = get_user_id(request, current_user)

        result = await pdb_service.get_structure_info(pdb_id=pdb_id, user_id=user_id)

        if not result["success"]:
            raise HTTPException(status_code=404, detail=result.get("error", "Structure not found"))

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get structure info failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get structure info: {str(e)}")


@router.post("/download", summary="Download structure file")
async def download_structure(
    request: Request,
    download_request: StructureDownloadRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Download a structure file in the specified format.

    Returns the file for download and then deletes it from server.
    Supported formats:
    - pdb: PDB format (3D structure)
    - cif: CIF format
    - mmcif: mmCIF format
    - bcif: Binary CIF format
    """
    try:
        # Validate PDB ID
        pdb_id = download_request.pdb_id.upper().strip()
        if len(pdb_id) != 4 or not pdb_id.isalnum():
            raise HTTPException(status_code=400, detail="PDB ID must be 4 alphanumeric characters")

        # Validate format - now including PDB for 3D structures
        supported_formats = ["pdb", "cif", "mmcif", "bcif"]
        if download_request.format_type.lower() not in supported_formats:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format. Supported formats: {', '.join(supported_formats)}"
            )

        user_id = get_user_id(request, current_user)

        # Download the file
        result = await pdb_service.download_structure(
            pdb_id=pdb_id,
            format_type=download_request.format_type.lower(),
            user_id=user_id
        )

        if not result["success"]:
            raise HTTPException(status_code=404, detail=result.get("error", "Download failed"))

        file_path = result["file_path"]
        filename = result["filename"]

        # Check if file exists
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Downloaded file not found")

        # Create a function to delete file after response
        async def cleanup_file():
            try:
                await asyncio.sleep(1)  # Wait a moment for download to complete
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Cleaned up downloaded file: {filename}")
            except Exception as e:
                logger.warning(f"Failed to cleanup file {filename}: {e}")

        # Schedule cleanup task
        asyncio.create_task(cleanup_file())

        # Return file for download
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Description": f"PDB Structure {pdb_id} in {download_request.format_type.upper()} format"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@router.post("/compare", summary="Compare multiple structures")
async def compare_structures(
    request: Request,
    comparison_request: StructureComparisonRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Compare multiple structures and get recommendations for the best one.

    Returns detailed comparison table and statistics.
    """
    try:
        # Validate PDB IDs
        validated_pdb_ids = []
        for pdb_id in comparison_request.pdb_ids:
            pdb_id = pdb_id.upper().strip()
            if len(pdb_id) != 4 or not pdb_id.isalnum():
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid PDB ID: {pdb_id}. Must be 4 alphanumeric characters"
                )
            validated_pdb_ids.append(pdb_id)

        # Remove duplicates
        validated_pdb_ids = list(set(validated_pdb_ids))

        if len(validated_pdb_ids) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 unique PDB IDs required for comparison"
            )

        user_id = get_user_id(request, current_user)

        result = await pdb_service.compare_structures(
            pdb_ids=validated_pdb_ids,
            user_id=user_id
        )

        if not result["success"]:
            raise HTTPException(status_code=404, detail=result.get("error", "Comparison failed"))

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Structure comparison failed: {e}")
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")


@router.post("/search/similar", summary="Find similar structures")
async def search_similar_structures(
    request: Request,
    similarity_request: SimilaritySearchRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Find structures similar to a given PDB structure using structural similarity.
    """
    try:
        # Validate PDB ID
        pdb_id = similarity_request.pdb_id.upper().strip()
        if len(pdb_id) != 4 or not pdb_id.isalnum():
            raise HTTPException(status_code=400, detail="PDB ID must be 4 alphanumeric characters")

        user_id = get_user_id(request, current_user)

        result = await pdb_service.search_similar_structures(
            pdb_id=pdb_id,
            similarity_cutoff=similarity_request.similarity_cutoff,
            max_results=similarity_request.max_results,
            user_id=user_id
        )

        if not result["success"]:
            raise HTTPException(status_code=404, detail=result.get("error", "Similar search failed"))

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Similar structure search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Similar search failed: {str(e)}")


@router.get("/formats", summary="Get supported download formats")
async def get_supported_formats():
    """Get list of supported file formats for download."""
    return {
        "formats": {
            "pdb": {
                "name": "PDB Format",
                "description": "Protein Data Bank format - 3D structure file",
                "extension": "pdb",
                "type": "3D"
            },
            "cif": {
                "name": "CIF Format",
                "description": "Crystallographic Information File",
                "extension": "cif",
                "type": "2D/3D"
            },
            "mmcif": {
                "name": "mmCIF Format",
                "description": "Macromolecular Crystallographic Information File",
                "extension": "cif",
                "type": "2D/3D"
            },
            "bcif": {
                "name": "BinaryCIF Format",
                "description": "Binary Crystallographic Information File",
                "extension": "bcif",
                "type": "2D/3D"
            }
        }
    }


@router.get("/experimental-methods", summary="Get experimental methods")
async def get_experimental_methods():
    """Get list of available experimental methods for filtering."""
    return {
        "methods": [
            {
                "code": "X-RAY",
                "name": "X-ray Crystallography",
                "description": "Most common method, provides atomic-level detail"
            },
            {
                "code": "NMR",
                "name": "Solution NMR",
                "description": "Provides structure in solution state"
            },
            {
                "code": "CRYO-EM",
                "name": "Cryo-Electron Microscopy",
                "description": "Suitable for large complexes"
            },
            {
                "code": "NEUTRON",
                "name": "Neutron Diffraction",
                "description": "Can locate hydrogen atoms"
            }
        ]
    }


@router.get("/stats", summary="Get PDB database statistics")
async def get_pdb_stats():
    """Get general statistics about the PDB database."""
    return {
        "message": "PDB contains over 200,000 structures",
        "last_updated": "2024-09-01",
        "total_structures": "200,000+",
        "experimental_methods": {
            "X-RAY DIFFRACTION": "85%+",
            "ELECTRON MICROSCOPY": "10%+",
            "SOLUTION NMR": "8%+",
            "OTHERS": "<2%"
        },
        "resolution_ranges": {
            "< 1.5 Å": "High resolution",
            "1.5 - 2.5 Å": "Good resolution",
            "2.5 - 3.5 Å": "Moderate resolution",
            "> 3.5 Å": "Lower resolution"
        }
    }