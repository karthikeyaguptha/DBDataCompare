"""Database adapter package.

SQL Server and PostgreSQL connection implementations are added in Phase 2.
"""
"""Database adapter routing."""

from typing import Any

from . import postgres, sqlserver
from .errors import DatabaseConfigurationError, DatabaseConnectionError


def test_database_connection(database_type: str, config: dict[str, Any]) -> None:
    if database_type == "sqlserver":
        sqlserver.test_connection(config)
        return
    if database_type == "postgres":
        postgres.test_connection(config)
        return
    raise DatabaseConfigurationError("Unsupported database type.")


def load_table_names(
    sqlserver_config: dict[str, Any], postgres_config: dict[str, Any]
) -> tuple[list[str], list[str]]:
    return sqlserver.list_tables(sqlserver_config), postgres.list_tables(postgres_config)


__all__ = [
    "DatabaseConfigurationError",
    "DatabaseConnectionError",
    "load_table_names",
    "test_database_connection",
]
