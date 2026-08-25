"""
PDB Service for comprehensive protein structure database integration.
Uses rcsb-api Python package for search and data retrieval.
"""

import asyncio
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import logging
import requests
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
import functools

# rcsb-api imports
from rcsbapi.search import TextQuery, AttributeQuery, StructSimilarityQuery
from rcsbapi.search import search_attributes as attrs
from rcsbapi.data import DataQuery
from rcsbapi.model import ModelQuery

from app.core.config import settings
from app.core.redis_client import get_redis_client

logger = logging.getLogger(__name__)

# Create a thread pool executor for running synchronous rcsb-api calls
_thread_pool = ThreadPoolExecutor(max_workers=4)

def run_in_thread(func):
    """Decorator to run synchronous functions in a thread pool."""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_thread_pool, func, *args, **kwargs)
    return wrapper

def _execute_data_query_sync(data_query):
    """Synchronous wrapper for DataQuery execution."""
    return data_query.exec()

def _execute_search_query_sync(search_query):
    """Synchronous wrapper for search query execution."""
    return list(search_query())

def _download_structure_sync(pdb_id, format_type, file_path):
    """Synchronous wrapper for ModelQuery download."""

    # For PDB format, download directly from RCSB files server
    if format_type.lower() == "pdb":
        import requests
        url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        filename = f"{pdb_id.upper()}.pdb"
        file_path_full = file_path.parent / filename
        with open(file_path_full, 'wb') as f:
            f.write(response.content)

        return response.content, filename

    # For CIF/mmCIF/BCIF formats, use ModelQuery
    mq = ModelQuery()

    # Map format types to encoding
    encoding_map = {
        "cif": "cif",
        "mmcif": "cif",
        "bcif": "bcif"
    }

    encoding = encoding_map.get(format_type.lower(), "cif")
    filename = f"{pdb_id}.{format_type.lower()}"

    # Use ModelQuery to download
    result = mq.get_full_structure(
        entry_id=pdb_id.upper(),
        encoding=encoding,
        download=True,
        filename=filename,
        file_directory=str(file_path.parent),
        compress_gzip=False
    )

    return result, filename

class RateLimiter:
    """Rate limiter for PDB API calls to prevent overwhelming the service."""

    def __init__(self, max_calls: int = 10, time_window: int = 60):
        self.max_calls = max_calls
        self.time_window = time_window
        self.calls = []

    async def wait_if_needed(self, user_id: str = "anonymous"):
        """Check rate limit and wait if necessary."""
        try:
            redis_client = await get_redis_client()
            key = f"pdb_rate_limit:{user_id}"

            # Get current call count in time window
            current_time = time.time()
            pipe = redis_client.pipeline()
            pipe.zremrangebyscore(key, 0, current_time - self.time_window)
            pipe.zcard(key)
            pipe.zadd(key, {str(current_time): current_time})
            pipe.expire(key, self.time_window)

            results = await pipe.execute()
            call_count = results[1]

            if call_count >= self.max_calls:
                wait_time = self.time_window
                logger.warning(f"Rate limit exceeded for user {user_id}. Waiting {wait_time}s")
                await asyncio.sleep(wait_time)

        except Exception as e:
            logger.error(f"Rate limiter error: {e}")
            # Fallback to simple delay
            await asyncio.sleep(1)


class PDBService:
    """Comprehensive PDB service using rcsb-api Python package."""

    def __init__(self):
        self.rate_limiter = RateLimiter(max_calls=15, time_window=60)
        self.files_url = "https://files.rcsb.org/download"

        # Create PDB downloads directory
        self.download_dir = Path(settings.UPLOAD_DIR) / "pdb_downloads"
        self.download_dir.mkdir(exist_ok=True, parents=True)

    async def search_by_protein_name(
        self,
        protein_name: str,
        max_results: int = 50,
        user_id: str = "anonymous"
    ) -> Dict[str, Any]:
        """Search for all experimental structures of a protein by name."""
        await self.rate_limiter.wait_if_needed(user_id)

        try:
            # Create text query for protein name
            query = TextQuery(value=protein_name)

            # Execute search in thread pool to avoid event loop conflict
            loop = asyncio.get_event_loop()
            pdb_ids = await loop.run_in_executor(_thread_pool, _execute_search_query_sync, query)

            if not pdb_ids:
                return {"success": False, "message": "No structures found", "data": []}

            # Limit results
            pdb_ids = pdb_ids[:max_results]
            logger.info(f"Found {len(pdb_ids)} structures for '{protein_name}'")

            # Get detailed information for each structure
            structures = []
            for pdb_id in pdb_ids:
                await self.rate_limiter.wait_if_needed(user_id)
                structure_info = await self._get_structure_details(pdb_id)
                if structure_info:
                    structures.append(structure_info)

            # Sort by quality score
            structures = self._rank_structures(structures)

            return {
                "success": True,
                "query": protein_name,
                "total_found": len(structures),
                "structures": structures
            }

        except Exception as e:
            logger.error(f"Error searching for protein {protein_name}: {e}")
            return {"success": False, "error": str(e), "data": []}

    async def advanced_search(
        self,
        protein_name: Optional[str] = None,
        resolution_max: Optional[float] = None,
        resolution_min: Optional[float] = None,
        exp_method: Optional[str] = None,
        release_year_min: Optional[int] = None,
        release_year_max: Optional[int] = None,
        organism: Optional[str] = None,
        max_results: int = 100,
        user_id: str = "anonymous"
    ) -> Dict[str, Any]:
        """Advanced search with multiple filters using rcsb-api."""
        await self.rate_limiter.wait_if_needed(user_id)

        try:
            # Build compound query using search attributes
            queries = []

            # Protein name search
            if protein_name:
                queries.append(TextQuery(value=protein_name))

            # Resolution filter
            if resolution_max or resolution_min:
                if resolution_min and resolution_max:
                    # Range query
                    queries.append(
                        (attrs.rcsb_entry_info.resolution_combined >= resolution_min) &
                        (attrs.rcsb_entry_info.resolution_combined <= resolution_max)
                    )
                elif resolution_min:
                    queries.append(attrs.rcsb_entry_info.resolution_combined >= resolution_min)
                elif resolution_max:
                    queries.append(attrs.rcsb_entry_info.resolution_combined <= resolution_max)

            # Experimental method
            if exp_method:
                method_map = {
                    "X-RAY": "X-RAY DIFFRACTION",
                    "NMR": "SOLUTION NMR",
                    "CRYO-EM": "ELECTRON MICROSCOPY",
                    "NEUTRON": "NEUTRON DIFFRACTION"
                }
                method_value = method_map.get(exp_method.upper(), exp_method)
                queries.append(attrs.exptl.method == method_value)

            # Release date filters
            if release_year_min:
                queries.append(
                    attrs.rcsb_accession_info.initial_release_date >= f"{release_year_min}-01-01"
                )
            if release_year_max:
                queries.append(
                    attrs.rcsb_accession_info.initial_release_date <= f"{release_year_max}-12-31"
                )

            # Organism filter
            if organism:
                queries.append(
                    attrs.rcsb_entity_source_organism.scientific_name.contains_words(organism)
                )

            if not queries:
                return {"success": False, "error": "At least one search parameter required"}

            # Combine queries with AND logic
            combined_query = queries[0]
            for query in queries[1:]:
                combined_query = combined_query & query

            # Execute search in thread pool to avoid event loop conflict
            loop = asyncio.get_event_loop()
            pdb_ids = await loop.run_in_executor(_thread_pool, _execute_search_query_sync, combined_query)

            if not pdb_ids:
                return {"success": False, "message": "No structures found matching criteria", "data": []}

            # Limit results
            pdb_ids = pdb_ids[:max_results]
            logger.info(f"Advanced search found {len(pdb_ids)} structures")

            # Get detailed info
            structures = []
            for pdb_id in pdb_ids:
                await self.rate_limiter.wait_if_needed(user_id)
                structure_info = await self._get_structure_details(pdb_id)
                if structure_info:
                    structures.append(structure_info)

            structures = self._rank_structures(structures)

            return {
                "success": True,
                "search_params": {
                    "protein_name": protein_name,
                    "resolution_range": f"{resolution_min or 'any'} - {resolution_max or 'any'} Å",
                    "exp_method": exp_method,
                    "release_years": f"{release_year_min or 'any'} - {release_year_max or 'any'}",
                    "organism": organism
                },
                "total_found": len(structures),
                "structures": structures
            }

        except Exception as e:
            logger.error(f"Advanced search error: {e}")
            return {"success": False, "error": str(e)}

    async def _get_structure_details(self, pdb_id: str) -> Optional[Dict[str, Any]]:
        """Get comprehensive details for a PDB structure using Data API."""
        try:
            # Use Data API to get comprehensive structure information
            data_query = DataQuery(
                input_type="entries",
                input_ids=[pdb_id.upper()],
                return_data_list=[
                    "struct.title",
                    "struct.pdbx_descriptor",
                    "exptl.method",
                    "rcsb_entry_info.resolution_combined",
                    "rcsb_entry_info.experimental_method",
                    "refine.ls_d_res_high",
                    "refine.ls_R_factor_R_work",
                    "refine.ls_R_factor_R_free",
                    "symmetry.space_group_name_H_M",
                    "rcsb_accession_info.initial_release_date",
                    "rcsb_accession_info.deposit_date",
                    "rcsb_accession_info.revision_date",
                    "struct_keywords.pdbx_keywords",
                    "audit_author.name",
                    "rcsb_entry_container_identifiers.polymer_entity_ids",
                    "rcsb_primary_citation.pdbx_database_id_DOI",
                    # New fields for organism, mutations, chains, sequence length
                    "polymer_entities.rcsb_entity_source_organism.ncbi_scientific_name",
                    "polymer_entities.rcsb_entity_source_organism.ncbi_taxonomy_id",
                    "polymer_entities.entity_poly.pdbx_seq_one_letter_code_can",
                    "polymer_entities.rcsb_polymer_entity_annotation.type",
                    "polymer_entities.rcsb_polymer_entity_annotation.description",
                    "polymer_entity_instances.rcsb_polymer_entity_instance_container_identifiers.auth_asym_id",
                    "polymer_entity_instances.rcsb_polymer_entity_instance_container_identifiers.entity_id"
                ]
            )

            # Execute query in thread pool to avoid event loop conflict
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(_thread_pool, _execute_data_query_sync, data_query)

            if not response or not response.get("data", {}).get("entries"):
                return None

            entry_data = response["data"]["entries"][0]

            # Extract information with safe access
            def safe_get(data, path, default=None):
                """Safely navigate nested dict structure."""
                try:
                    for key in path.split('.'):
                        if isinstance(data, list) and data:
                            data = data[0]  # Take first item from list
                        data = data[key]
                    return data
                except (KeyError, TypeError, IndexError):
                    return default

            def safe_get_numeric(data, path, default=None):
                """Safely extract numeric value, handling lists and converting to float."""
                try:
                    value = safe_get(data, path, default)
                    if value is None:
                        return default

                    # Handle list values
                    if isinstance(value, list):
                        if len(value) > 0:
                            value = value[0]
                        else:
                            return default

                    # Convert to float if possible
                    if value is not None:
                        return float(value)

                    return default
                except (ValueError, TypeError):
                    return default

            # Extract experiment data
            exptl_method = safe_get(entry_data, "exptl.method", "Unknown")
            resolution = safe_get_numeric(entry_data, "rcsb_entry_info.resolution_combined")
            if not resolution:
                resolution = safe_get_numeric(entry_data, "refine.ls_d_res_high")

            # Extract refinement data
            r_factor = safe_get_numeric(entry_data, "refine.ls_R_factor_R_work")
            r_free = safe_get_numeric(entry_data, "refine.ls_R_factor_R_free")

            # Extract organism information
            organisms = []
            polymer_entities = entry_data.get("polymer_entities", [])
            if polymer_entities:
                for entity in polymer_entities:
                    org_data = entity.get("rcsb_entity_source_organism", [])
                    if isinstance(org_data, list):
                        for org in org_data:
                            if isinstance(org, dict):
                                sci_name = org.get("ncbi_scientific_name")
                                tax_id = org.get("ncbi_taxonomy_id")
                                if sci_name:
                                    organisms.append({
                                        "scientific_name": sci_name,
                                        "taxonomy_id": tax_id
                                    })
                    elif isinstance(org_data, dict):
                        sci_name = org_data.get("ncbi_scientific_name")
                        tax_id = org_data.get("ncbi_taxonomy_id")
                        if sci_name:
                            organisms.append({
                                "scientific_name": sci_name,
                                "taxonomy_id": tax_id
                            })

            # Extract mutations/annotations
            mutations = []
            for entity in polymer_entities:
                annotations = entity.get("rcsb_polymer_entity_annotation", [])
                if isinstance(annotations, list):
                    for annotation in annotations:
                        if isinstance(annotation, dict):
                            ann_type = annotation.get("type")
                            ann_desc = annotation.get("description")
                            if ann_type and "mutation" in ann_type.lower():
                                mutations.append({
                                    "type": ann_type,
                                    "description": ann_desc
                                })

            # Extract chain information
            chains = []
            polymer_instances = entry_data.get("polymer_entity_instances", [])
            if polymer_instances:
                for instance in polymer_instances:
                    identifiers = instance.get("rcsb_polymer_entity_instance_container_identifiers", {})
                    if isinstance(identifiers, dict):
                        chain_id = identifiers.get("auth_asym_id")
                        entity_id = identifiers.get("entity_id")
                        if chain_id:
                            chains.append({
                                "chain_id": chain_id,
                                "entity_id": entity_id
                            })

            # Calculate sequence lengths and unit proteins count
            unit_proteins = []
            sequence_lengths = []
            for entity in polymer_entities:
                sequence = entity.get("entity_poly", {})
                if isinstance(sequence, dict):
                    seq_code = sequence.get("pdbx_seq_one_letter_code_can")
                    if seq_code:
                        seq_length = len(seq_code)
                        sequence_lengths.append(seq_length)
                        unit_proteins.append({
                            "sequence": seq_code[:100] + "..." if len(seq_code) > 100 else seq_code,
                            "length": seq_length
                        })
                elif isinstance(sequence, list) and sequence:
                    seq_code = sequence[0].get("pdbx_seq_one_letter_code_can")
                    if seq_code:
                        seq_length = len(seq_code)
                        sequence_lengths.append(seq_length)
                        unit_proteins.append({
                            "sequence": seq_code[:100] + "..." if len(seq_code) > 100 else seq_code,
                            "length": seq_length
                        })

            # Build structure info
            structure_info = {
                "pdb_id": pdb_id.upper(),
                "title": safe_get(entry_data, "struct.title", "No title"),
                "description": safe_get(entry_data, "struct.pdbx_descriptor", "No description"),
                "release_date": safe_get(entry_data, "rcsb_accession_info.initial_release_date", "Unknown"),
                "resolution": resolution,
                "experimental_method": exptl_method,
                "space_group": safe_get(entry_data, "symmetry.space_group_name_H_M", "Unknown"),
                "r_factor": r_factor,
                "r_free": r_free,
                "proteins": [],  # Will be populated separately if needed
                "authors": safe_get(entry_data, "audit_author.name", "Unknown"),
                "doi": safe_get(entry_data, "rcsb_primary_citation.pdbx_database_id_DOI"),
                "keywords": [kw.strip() for kw in safe_get(entry_data, "struct_keywords.pdbx_keywords", "").split(",") if kw.strip()] if safe_get(entry_data, "struct_keywords.pdbx_keywords") else [],
                "deposition_date": safe_get(entry_data, "rcsb_accession_info.deposit_date", "Unknown"),
                "revision_date": safe_get(entry_data, "rcsb_accession_info.revision_date", "Unknown"),
                # New fields
                "organisms": organisms,
                "mutations": mutations,
                "chains": chains,
                "unit_proteins": unit_proteins,
                "sequence_length": max(sequence_lengths) if sequence_lengths else None,
                "total_chains": len(chains)
            }

            # Calculate quality score
            structure_info["quality_score"] = self._calculate_quality_score(structure_info)

            return structure_info

        except Exception as e:
            logger.error(f"Error getting details for {pdb_id}: {e}")
            return None

    def _calculate_quality_score(self, structure_info: Dict[str, Any]) -> float:
        """Calculate a quality score based on multiple factors."""
        score = 0.0

        # Helper function to safely convert to float
        def to_float(value):
            """Safely convert value to float, handling lists."""
            if value is None:
                return None
            if isinstance(value, list):
                if len(value) > 0:
                    value = value[0]
                else:
                    return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None

        # Resolution contribution (40% of score)
        resolution = to_float(structure_info.get("resolution"))
        if resolution is not None:
            # Better (lower) resolution gets higher score
            if resolution <= 1.0:
                score += 40
            elif resolution <= 1.5:
                score += 35
            elif resolution <= 2.0:
                score += 30
            elif resolution <= 2.5:
                score += 25
            elif resolution <= 3.0:
                score += 20
            else:
                score += 10

        # R-factor contribution (25% of score)
        r_factor = to_float(structure_info.get("r_factor"))
        if r_factor is not None:
            if r_factor <= 0.15:
                score += 25
            elif r_factor <= 0.20:
                score += 20
            elif r_factor <= 0.25:
                score += 15
            else:
                score += 5

        # R-free contribution (25% of score)
        r_free = to_float(structure_info.get("r_free"))
        if r_free is not None:
            if r_free <= 0.20:
                score += 25
            elif r_free <= 0.25:
                score += 20
            elif r_free <= 0.30:
                score += 15
            else:
                score += 5

        # Experimental method contribution (10% of score)
        exp_method = structure_info.get("experimental_method", "").upper()
        if "X-RAY" in exp_method:
            score += 10
        elif "NMR" in exp_method:
            score += 8
        elif "ELECTRON" in exp_method:
            score += 6
        else:
            score += 3

        return min(score, 100.0)

    def _rank_structures(self, structures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Rank structures by quality score and other factors."""
        return sorted(structures, key=lambda x: (
            -x.get("quality_score", 0),  # Higher quality first
            x.get("resolution", float('inf')),  # Lower resolution first
            -len(x.get("proteins", [])),  # More proteins first
            x.get("release_date", "")  # More recent first
        ))

    async def download_structure(
        self,
        pdb_id: str,
        format_type: str = "pdb",
        user_id: str = "anonymous"
    ) -> Dict[str, Any]:
        """Download structure file in specified format - supports both 2D and 3D formats."""
        await self.rate_limiter.wait_if_needed(user_id)

        try:
            pdb_id = pdb_id.upper()

            # Supported formats - now including PDB for 3D structures
            supported_formats = ["pdb", "cif", "mmcif", "bcif"]

            if format_type.lower() not in supported_formats:
                return {"success": False, "error": f"Unsupported format: {format_type}. Supported: {supported_formats}"}

            # Prepare file path
            filename = f"{pdb_id}.{format_type.lower()}"
            file_path = self.download_dir / filename

            # Check if file already exists
            if file_path.exists():
                return {
                    "success": True,
                    "file_path": str(file_path),
                    "filename": filename,
                    "size": file_path.stat().st_size,
                    "cached": True
                }

            # Create download directory if it doesn't exist
            self.download_dir.mkdir(parents=True, exist_ok=True)

            # Download in thread pool
            loop = asyncio.get_event_loop()
            result, actual_filename = await loop.run_in_executor(
                _thread_pool,
                _download_structure_sync,
                pdb_id,
                format_type,
                file_path
            )

            # Check if download was successful
            downloaded_file_path = self.download_dir / actual_filename
            if downloaded_file_path.exists():
                return {
                    "success": True,
                    "file_path": str(downloaded_file_path),
                    "filename": actual_filename,
                    "size": downloaded_file_path.stat().st_size,
                    "cached": False,
                    "pdb_id": pdb_id,
                    "format": format_type
                }
            else:
                return {"success": False, "error": "File was not downloaded successfully"}

        except Exception as e:
            logger.error(f"Error downloading {pdb_id} in {format_type} format: {e}")
            return {"success": False, "error": f"Download failed: {str(e)}"}

    async def compare_structures(
        self,
        pdb_ids: List[str],
        user_id: str = "anonymous"
    ) -> Dict[str, Any]:
        """Compare multiple structures and provide recommendations."""
        if len(pdb_ids) < 2:
            return {"success": False, "error": "At least 2 structures required for comparison"}

        try:
            structures = []
            for pdb_id in pdb_ids[:10]:  # Limit to 10 structures
                await self.rate_limiter.wait_if_needed(user_id)
                structure_info = await self._get_structure_details(pdb_id)
                if structure_info:
                    structures.append(structure_info)

            if not structures:
                return {"success": False, "error": "No valid structures found"}

            # Rank structures
            ranked_structures = self._rank_structures(structures)
            best_structure = ranked_structures[0]

            # Create comparison table
            comparison = {
                "best_recommendation": {
                    "pdb_id": best_structure["pdb_id"],
                    "reason": self._get_recommendation_reason(best_structure, structures),
                    "quality_score": best_structure["quality_score"]
                },
                "comparison_table": [],
                "statistics": self._get_comparison_stats(structures)
            }

            # Build comparison table
            for struct in ranked_structures:
                comparison["comparison_table"].append({
                    "pdb_id": struct["pdb_id"],
                    "title": struct["title"][:80] + "..." if len(struct["title"]) > 80 else struct["title"],
                    "resolution": struct.get("resolution"),
                    "r_factor": struct.get("r_factor"),
                    "r_free": struct.get("r_free"),
                    "experimental_method": struct["experimental_method"],
                    "release_date": struct["release_date"],
                    "quality_score": struct["quality_score"],
                    "proteins_count": len(struct.get("proteins", []))
                })

            return {"success": True, "comparison": comparison}

        except Exception as e:
            logger.error(f"Error comparing structures: {e}")
            return {"success": False, "error": str(e)}

    def _get_recommendation_reason(self, best_structure: Dict[str, Any], all_structures: List[Dict[str, Any]]) -> str:
        """Generate explanation for why this structure is recommended."""
        reasons = []

        resolution = best_structure.get("resolution")
        if resolution and resolution <= 2.0:
            reasons.append(f"High resolution ({resolution}Å)")

        r_factor = best_structure.get("r_factor")
        if r_factor and r_factor <= 0.20:
            reasons.append(f"Good R-factor ({r_factor:.3f})")

        r_free = best_structure.get("r_free")
        if r_free and r_free <= 0.25:
            reasons.append(f"Good R-free ({r_free:.3f})")

        exp_method = best_structure.get("experimental_method", "")
        if "X-RAY" in exp_method.upper():
            reasons.append("X-ray crystallography")

        if not reasons:
            reasons.append("Highest overall quality score")

        return "; ".join(reasons)

    def _get_comparison_stats(self, structures: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate statistics for the compared structures."""
        resolutions = [s.get("resolution") for s in structures if s.get("resolution")]
        r_factors = [s.get("r_factor") for s in structures if s.get("r_factor")]
        quality_scores = [s.get("quality_score", 0) for s in structures]

        methods = {}
        for struct in structures:
            method = struct.get("experimental_method", "Unknown")
            methods[method] = methods.get(method, 0) + 1

        return {
            "total_structures": len(structures),
            "resolution_stats": {
                "min": min(resolutions) if resolutions else None,
                "max": max(resolutions) if resolutions else None,
                "avg": sum(resolutions) / len(resolutions) if resolutions else None
            },
            "r_factor_stats": {
                "min": min(r_factors) if r_factors else None,
                "max": max(r_factors) if r_factors else None,
                "avg": sum(r_factors) / len(r_factors) if r_factors else None
            },
            "quality_score_stats": {
                "min": min(quality_scores),
                "max": max(quality_scores),
                "avg": sum(quality_scores) / len(quality_scores)
            },
            "experimental_methods": methods
        }

    async def get_structure_info(self, pdb_id: str, user_id: str = "anonymous") -> Dict[str, Any]:
        """Get comprehensive information about a single structure."""
        await self.rate_limiter.wait_if_needed(user_id)

        try:
            structure_info = await self._get_structure_details(pdb_id.upper())

            if not structure_info:
                return {"success": False, "error": f"Structure {pdb_id} not found"}

            return {"success": True, "structure": structure_info}

        except Exception as e:
            logger.error(f"Error getting structure info for {pdb_id}: {e}")
            return {"success": False, "error": str(e)}

    async def search_similar_structures(
        self,
        pdb_id: str,
        similarity_cutoff: float = 0.9,
        max_results: int = 20,
        user_id: str = "anonymous"
    ) -> Dict[str, Any]:
        """Find structures similar to the given PDB ID using structural similarity."""
        await self.rate_limiter.wait_if_needed(user_id)

        try:
            # Use structural similarity search
            struct_query = StructSimilarityQuery(
                entry_id=pdb_id.upper(),
                assembly_id="1"  # Use assembly 1 by default
            )

            # Execute search in thread pool to avoid event loop conflict
            loop = asyncio.get_event_loop()
            similar_ids = await loop.run_in_executor(_thread_pool, _execute_search_query_sync, struct_query)

            if not similar_ids:
                return {"success": False, "message": "No similar structures found"}

            # Get details for similar structures (exclude the query structure)
            structures = []
            for similar_id in similar_ids:
                if similar_id.upper() != pdb_id.upper():  # Exclude the query structure itself
                    await self.rate_limiter.wait_if_needed(user_id)
                    structure_info = await self._get_structure_details(similar_id)
                    if structure_info:
                        structures.append(structure_info)

                    if len(structures) >= max_results:
                        break

            structures = self._rank_structures(structures)

            return {
                "success": True,
                "query_pdb": pdb_id.upper(),
                "similarity_cutoff": similarity_cutoff,
                "total_found": len(structures),
                "similar_structures": structures
            }

        except Exception as e:
            logger.error(f"Error finding similar structures to {pdb_id}: {e}")
            return {"success": False, "error": str(e)}


# Global service instance
pdb_service = PDBService()