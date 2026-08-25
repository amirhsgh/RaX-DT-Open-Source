"""Application configuration settings."""

import os
from typing import List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

# Open-source build runs single-user, no login. This is the one account every
# request acts as; seeded into the DB on startup (see database/connection.py).
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_USERNAME = "local"


class Settings(BaseSettings):
    """Application settings."""
    
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Virtual Screening API"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://virtual_screening:vs_password@localhost:5432/virtual_screening_db"
    )

    # Redis for Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/1")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    ALLOWED_ORIGINS: str = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:3001"
    )

    # Trusted hosts
    ALLOWED_HOSTS: str = os.getenv("ALLOWED_HOSTS", "*")  # Restrict in production
    
    # File Upload
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 100MB
    MAX_MOLECULES_PER_JOB: int = 10000
    UPLOAD_DIR: str = os.path.abspath(os.getenv("UPLOAD_DIR", "uploads"))
    TEMP_DIR: str = os.path.abspath(os.getenv("TEMP_DIR", "data/temp"))
    RESULTS_DIR: str = os.path.abspath(os.getenv("RESULTS_DIR", "data/results"))

    # Benchmark suite (DUD-E / LIT-PCBA style datasets for AUROC/EF/BEDROC validation)
    BENCHMARK_DATA_DIR: str = os.getenv("BENCHMARK_DATA_DIR", os.path.abspath("dataset"))
    BENCHMARK_RANDOM_SEED: int = int(os.getenv("BENCHMARK_RANDOM_SEED", "42"))
    
    # Processing
    MAX_CONCURRENT_JOBS: int = 10
    MAX_WORKERS_PER_JOB: int = 32
    CORES_PER_GNINA_JOB: int =8
    
    # GNINA optimization settings
    GNINA_FAST_MODE: bool = os.getenv("GNINA_FAST_MODE", "false").lower() == "true"
    GNINA_MAX_EXHAUSTIVENESS: int = int(os.getenv("GNINA_MAX_EXHAUSTIVENESS", "32"))
    GNINA_MAX_SEARCH_SIZE: int = int(os.getenv("GNINA_MAX_SEARCH_SIZE", "40"))
    GNINA_CNN_SCORING: bool = os.getenv("GNINA_CNN_SCORING", "true").lower() == "true"
    GNINA_CNN_MODEL: str = os.getenv("GNINA_CNN_MODEL", "default2017")
    
    # External Tools (Default paths for WSL)
    OBABEL_PATH: str = os.getenv("OBABEL_PATH", "obabel")  # Should be in PATH after conda/uv install
    GNINA_PATH: str = os.getenv("GNINA_PATH", "docker")  # GNINA runs in Docker container now
    # Keep VINA_PATH for backward compatibility
    VINA_PATH: str = os.getenv("VINA_PATH", "vina")

    # Docker settings
    USE_GNINA_DOCKER: bool = os.getenv("USE_GNINA_DOCKER", "true").lower() == "true"
    GNINA_CONTAINER_NAME: str = os.getenv("GNINA_CONTAINER_NAME", "vs-gnina")

    # Whether to let GNINA use a GPU for CNN scoring. setup.sh sets this to
    # false on servers where no GPU was detected, which appends --no_gpu to
    # the GNINA command (see app/services/gnina_local_service.py).
    GNINA_USE_GPU: bool = os.getenv("GNINA_USE_GPU", "true").lower() == "true"
    
    # Development
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    SQL_DEBUG: bool = os.getenv("SQL_DEBUG", "false").lower() == "true"
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"

settings = Settings()
