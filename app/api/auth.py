"""
Single-user identity stub.

This open-source build has no login/signup flow — every request acts as the
one local user seeded on startup (see app/database/connection.py). Kept as a
FastAPI dependency (rather than deleting it outright) because several routers
still take `current_user` via Depends() to attribute data to a user_id.
"""

from typing import Any, Dict

from app.core.config import DEFAULT_USER_ID, DEFAULT_USERNAME

_LOCAL_USER: Dict[str, Any] = {
    "id": DEFAULT_USER_ID,
    "username": DEFAULT_USERNAME,
    "email": None,
    "full_name": "Local User",
    "role": "admin",
    "is_verified": True,
}


async def get_current_user() -> Dict[str, Any]:
    """Return the single local user (no authentication required)."""
    return _LOCAL_USER


async def get_current_user_optional() -> Dict[str, Any]:
    """Same as get_current_user; kept for call sites expecting an optional variant."""
    return _LOCAL_USER
