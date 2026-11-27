"""Inventory domain package."""

from app.inventory.ingestion import EventValidationError, ingest_event

__all__ = ["EventValidationError", "ingest_event"]
