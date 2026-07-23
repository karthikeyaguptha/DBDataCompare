"""Comparison engine package.

Streaming schema, count, and row comparison logic is added in later phases.
"""
"""Comparison services."""

from .schema import compare_table_schema

__all__ = ["compare_table_schema"]
