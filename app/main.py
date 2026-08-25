"""
Main FastAPI application for virtual screening.
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from app.database.connection import init_database
from app.api import projects, jobs, molecules, uploads, visualization, protein_preparation, chat, pdb, benchmark, redocking
from app.core.config import settings
from app.core.exceptions import ValidationException


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("🚀 Starting Virtual Screening Application")
    try:
        await init_database()
        logger.info("✅ Database initialized")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise

    # Create necessary directories using absolute paths from settings
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.TEMP_DIR, exist_ok=True)
    os.makedirs(settings.RESULTS_DIR, exist_ok=True)
    logger.info(f"📁 Data directories created:")
    logger.info(f"   Upload: {settings.UPLOAD_DIR}")
    logger.info(f"   Temp: {settings.TEMP_DIR}")
    logger.info(f"   Results: {settings.RESULTS_DIR}")

    yield

    # Shutdown
    logger.info("🛑 Shutting down Virtual Screening Application")


# Create FastAPI app
app = FastAPI(
    title="Virtual Screening API",
    description="""
    **Virtual Screening Application** for drug discovery and molecular docking.

    ## Features

    * **Upload** molecules (SDF) and protein structures (PDB)
    * **Process** ligands through 3D generation, tautomer enumeration, protonation
    * **Execute** molecular docking using AutoDock Vina
    * **Visualize** 3D molecular structures
    * **Export** results as CSV files

    ## Workflow

    1. Create a project
    2. Start a screening job
    3. Upload ligands and protein
    4. Configure docking parameters
    5. Monitor processing progress
    6. Download results

    Built with FastAPI, PostgreSQL, Redis, and Celery.
    """,
    version="0.1.0",
    terms_of_service="https://example.com/terms/",
    contact={
        "name": "Virtual Screening Team",
        "url": "https://example.com/contact/",
        "email": "support@virtualscreening.com",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
    lifespan=lifespan,
)

# Add CORS middleware
# Parse ALLOWED_ORIGINS: if "*", use ["*"]; otherwise split by comma
allowed_origins = (
    ["*"] if settings.ALLOWED_ORIGINS == "*"
    else [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]
)
logger.info(f"🌐 CORS allowed origins: {allowed_origins}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

# Add trusted host middleware
# Parse ALLOWED_HOSTS: if "*", use ["*"]; otherwise split by comma
allowed_hosts = (
    ["*"] if settings.ALLOWED_HOSTS == "*"
    else [host.strip() for host in settings.ALLOWED_HOSTS.split(",")]
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=allowed_hosts
)


@app.exception_handler(ValidationException)
async def validation_exception_handler(request: Request, exc: ValidationException):
    """Handle custom validation exceptions."""
    return JSONResponse(
        status_code=400,
        content={
            "error": "Validation Error",
            "message": str(exc),
            "details": exc.details if hasattr(exc, 'details') else None
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred",
            "request_id": str(id(request))
        }
    )


# Health check endpoint
@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "virtual-screening-api",
        "version": "0.1.0"
    }


@app.get("/", tags=["System"])
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Virtual Screening API",
        "version": "0.1.0",
        "docs": "/docs",
        "redoc": "/redoc",
        "health": "/health"
    }


# Include API routers
app.include_router(
    projects.router,
    prefix=f"{settings.API_V1_STR}/projects",
    tags=["Projects"]
)

app.include_router(
    jobs.router,
    prefix=f"{settings.API_V1_STR}/jobs",
    tags=["Jobs"]
)

app.include_router(
    molecules.router,
    prefix=f"{settings.API_V1_STR}/molecules",
    tags=["Molecules"]
)

app.include_router(
    uploads.router,
    prefix=f"{settings.API_V1_STR}/uploads",
    tags=["Uploads"]
)

app.include_router(
    visualization.router,
    prefix=f"{settings.API_V1_STR}/visualization",
    tags=["Visualization"]
)

app.include_router(
    protein_preparation.router,
    prefix=f"{settings.API_V1_STR}/protein-preparation",
    tags=["Protein Preparation"]
)

app.include_router(
    chat.router,
    prefix=f"{settings.API_V1_STR}",
    tags=["Chatbot"]
)

app.include_router(
    pdb.router,
    prefix=f"{settings.API_V1_STR}",
    tags=["PDB Database"]
)

app.include_router(
    benchmark.router,
    prefix=f"{settings.API_V1_STR}/benchmark",
    tags=["Benchmark"]
)

app.include_router(
    redocking.router,
    prefix=f"{settings.API_V1_STR}/redocking",
    tags=["Redocking"]
)


def run():
    """Run the FastAPI application."""
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )


if __name__ == "__main__":
    run()
