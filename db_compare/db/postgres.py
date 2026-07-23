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


def load_table_schema(config: dict[str, Any], table_name: str) -> dict[str, Any]:
    schema = str(config.get("schema") or "public").strip()
    try:
        with closing(connect(config)) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT column_name, data_type, is_nullable,
                           character_maximum_length, numeric_precision,
                           numeric_scale, datetime_precision
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (schema, table_name),
                )
                columns = [
                    {
                        "name": str(row[0]),
                        "data_type": str(row[1]),
                        "nullable": str(row[2]).upper() == "YES",
                        "character_length": row[3],
                        "numeric_precision": row[4],
                        "numeric_scale": row[5],
                        "datetime_precision": row[6],
                    }
                    for row in cursor.fetchall()
                ]
                if not columns:
                    raise DatabaseConfigurationError(
                        f'PostgreSQL table "{table_name}" was not found in schema "{schema}".'
                    )
                cursor.execute(
                    """
                    SELECT tc.constraint_type, tc.constraint_name,
                           kcu.column_name, kcu.ordinal_position
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.constraint_schema = kcu.constraint_schema
                    WHERE tc.table_schema = %s AND tc.table_name = %s
                      AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
                    ORDER BY CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 0 ELSE 1 END,
                             tc.constraint_name, kcu.ordinal_position
                    """,
                    (schema, table_name),
                )
                keys: dict[tuple[str, str], list[str]] = {}
                for row in cursor.fetchall():
                    keys.setdefault((str(row[0]), str(row[1])), []).append(str(row[2]))
                primary_key = next(
                    (
                        value
                        for (kind, _), value in keys.items()
                        if kind == "PRIMARY KEY"
                    ),
                    [],
                )
                unique_keys = [
                    value for (kind, _), value in keys.items() if kind == "UNIQUE"
                ]
                return {
                    "columns": columns,
                    "primary_key": primary_key,
                    "unique_keys": unique_keys,
                }
    except (DatabaseConnectionError, DatabaseConfigurationError):
        raise
    except Exception as exc:
        raise DatabaseConnectionError(_friendly_error(exc)) from exc


def count_table_rows(config: dict[str, Any], table_name: str) -> int:
    """Return an exact count without loading table rows into Python."""
    schema = str(config.get("schema") or "public").strip()
    try:
        from psycopg import sql
    except ImportError as exc:
        raise DatabaseConnectionError(
            "The PostgreSQL Python driver is not installed. Run setup.bat and try again."
        ) from exc

    try:
        with closing(connect(config)) as connection:
            with connection.cursor() as cursor:
                query = sql.SQL("SELECT COUNT(*) FROM {}.{}").format(
                    sql.Identifier(schema),
                    sql.Identifier(table_name),
                )
                cursor.execute(query)
                row = cursor.fetchone()
                return int(row[0])
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
