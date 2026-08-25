"""Database connection and session management."""

import os
import secrets
from typing import AsyncGenerator
from contextlib import asynccontextmanager, contextmanager
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from .models import Base, User
from app.core.config import DEFAULT_USER_ID, DEFAULT_USERNAME


# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+asyncpg://virtual_screening:vs_password@localhost:5432/virtual_screening_db"
)

# Create sync database URL (replace asyncpg with psycopg2)
SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_DEBUG", "false").lower() == "true",
    pool_size=20,
    max_overflow=0,
    pool_pre_ping=True,
)

# Create sync engine for Celery workers
sync_engine = create_engine(
    SYNC_DATABASE_URL,
    echo=os.getenv("SQL_DEBUG", "false").lower() == "true",
    pool_size=10,
    max_overflow=0,
    pool_pre_ping=True,
)

# Create async session factory
async_session_factory = sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

# Create sync session factory for Celery workers
sync_session_factory = sessionmaker(
    sync_engine,
    class_=Session,
    expire_on_commit=False
)

@asynccontextmanager
async def get_database() -> AsyncSession:
    """Get database session."""
    async with async_session_factory() as session:
        yield session


@contextmanager
def get_sync_database() -> Session:
    """Get synchronous database session for Celery workers."""
    with sync_session_factory() as session:
        try:
            yield session
        finally:
            session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for FastAPI to get database session."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_database() -> None:
    """Initialize database tables and seed the single local user."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        existing = await session.get(User, DEFAULT_USER_ID)
        if existing is None:
            local_user = User(id=DEFAULT_USER_ID, username=DEFAULT_USERNAME, is_active=True, is_verified=True)
            local_user.set_password(secrets.token_urlsafe(32))
            session.add(local_user)
            await session.commit()


async def drop_database() -> None:
    """Drop all database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)