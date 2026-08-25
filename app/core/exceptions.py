"""Custom exceptions for the application."""

from typing import Optional, Dict, Any


class VirtualScreeningException(Exception):
    """Base exception for virtual screening application."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


class ValidationException(VirtualScreeningException):
    """Exception raised for validation errors."""
    pass


class FileProcessingException(VirtualScreeningException):
    """Exception raised for file processing errors."""
    pass


class MoleculeProcessingException(VirtualScreeningException):
    """Exception raised for molecule processing errors."""
    pass


class DockingException(VirtualScreeningException):
    """Exception raised for docking errors."""
    pass


class DatabaseException(VirtualScreeningException):
    """Exception raised for database errors."""
    pass


class ExternalToolException(VirtualScreeningException):
    """Exception raised for external tool errors."""
    pass