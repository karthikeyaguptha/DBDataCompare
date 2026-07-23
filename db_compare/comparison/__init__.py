"""Comparison engine package.

Streaming schema, count, and row comparison logic is added in later phases.
"""
"""Comparison services."""

from .counts import compare_table_row_counts
from .schema import compare_table_schema

__all__ = ["compare_table_row_counts", "compare_table_schema"]
