"""PostgreSQL connectivity through Psycopg 3."""

from __future__ import annotations

from contextlib import closing
from typing import Any

from .errors import DatabaseConfigurationError, DatabaseConnectionError


def _required(config: dict[str, Any], name: str) -> str:
    value = str(config.get(name, "")).strip()
    if not value:
        raise DatabaseConfigurationError(f"PostgreSQL {name} is required.")
    return value


def connect(config: dict[str, Any]):
    try:
        import psycopg
    except ImportError as exc:
        raise DatabaseConnectionError(
            "The PostgreSQL Python driver is not installed. Run setup.bat and try again."
        ) from exc

    try:
        return psycopg.connect(
            host=_required(config, "host"),
            port=int(config.get("port") or 5432),
            dbname=_required(config, "database"),
            user=_required(config, "username"),
            password=_required(config, "password"),
            sslmode=str(config.get("sslmode") or "prefer"),
            connect_timeout=8,
            application_name="DB Compare Studio",
        )
    except DatabaseConfigurationError:
        raise
    except (TypeError, ValueError) as exc:
        raise DatabaseConfigurationError("PostgreSQL port must be a valid number.") from exc
    except Exception as exc:
        raise DatabaseConnectionError(_friendly_error(exc)) from exc


def test_connection(config: dict[str, Any]) -> None:
    with closing(connect(config)) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()


def list_tables(config: dict[str, Any]) -> list[str]:
    schema = str(config.get("schema") or "public").strip()
    try:
        with closing(connect(config)) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = %s AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                    """,
                    (schema,),
                )
                return [str(row[0]) for row in cursor.fetchall()]
    except DatabaseConnectionError:
        raise
    except Exception as exc:
        raise DatabaseConnectionError(_friendly_error(exc)) from exc


def _friendly_error(error: Exception) -> str:
    text = str(error).lower()
    if "password authentication failed" in text or "authentication failed" in text:
        return "PostgreSQL rejected the login. Check the username and password."
    if "could not translate host name" in text:
        return "The PostgreSQL host name could not be resolved."
    if "connection refused" in text or "could not connect" in text:
        return "PostgreSQL could not be reached. Check the host, port, network, and firewall."
    if "certificate" in text or "ssl" in text:
        return "PostgreSQL SSL negotiation failed. Check the SSL mode and server certificate."
    if "timeout" in text:
        return "The PostgreSQL connection timed out. Check the host and network access."
    if "does not exist" in text:
        return "The requested PostgreSQL database does not exist or is unavailable to this user."
    return "PostgreSQL connection failed. Check the supplied details and database availability."
