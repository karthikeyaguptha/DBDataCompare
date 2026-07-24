"""Microsoft SQL Server connectivity through pyodbc."""

from __future__ import annotations

from contextlib import closing
from typing import Any, Iterator

from ..cancellation import CancellationController

from .errors import DatabaseConfigurationError, DatabaseConnectionError


def _required(config: dict[str, Any], name: str) -> str:
    value = str(config.get(name, "")).strip()
    if not value:
        raise DatabaseConfigurationError(f"SQL Server {name} is required.")
    return value


def _odbc_value(value: str) -> str:
    """Escape a value for an ODBC connection string."""
    return "{" + value.replace("}", "}}") + "}"


def _connection_string(config: dict[str, Any]) -> str:
    server = _required(config, "server")
    database = _required(config, "database")
    port = str(config.get("port", "")).strip()
    driver = str(config.get("driver") or "ODBC Driver 18 for SQL Server").strip()
    authentication = str(config.get("authentication") or "credentials")

    server_address = f"{server},{port}" if port else server
    parts = [
        f"DRIVER={_odbc_value(driver)}",
        f"SERVER={_odbc_value(server_address)}",
        f"DATABASE={_odbc_value(database)}",
        "Encrypt=yes",
        f"TrustServerCertificate={'yes' if config.get('trust_server_certificate') else 'no'}",
        "APP=DB Compare Studio",
    ]

    if authentication == "windows":
        parts.append("Trusted_Connection=yes")
    elif authentication == "credentials":
        parts.extend(
            [
                f"UID={_odbc_value(_required(config, 'username'))}",
                f"PWD={_odbc_value(_required(config, 'password'))}",
            ]
        )
    else:
        raise DatabaseConfigurationError("Choose a supported SQL Server authentication type.")

    return ";".join(parts) + ";"


def connect(config: dict[str, Any]):
    try:
        import pyodbc
    except ImportError as exc:
        raise DatabaseConnectionError(
            "The SQL Server Python driver is not installed. Run setup.bat and try again."
        ) from exc

    selected_driver = str(
        config.get("driver") or "ODBC Driver 18 for SQL Server"
    ).strip()
    installed_drivers = {name.casefold() for name in pyodbc.drivers()}
    if selected_driver.casefold() not in installed_drivers:
        raise DatabaseConnectionError(
            f'The selected SQL Server ODBC driver "{selected_driver}" is unavailable '
            "to this Python installation. Run setup.bat again or choose an installed driver."
        )

    try:
        return pyodbc.connect(_connection_string(config), timeout=8)
    except DatabaseConfigurationError:
        raise
    except Exception as exc:
        raise DatabaseConnectionError(_friendly_error(exc)) from exc


def test_connection(config: dict[str, Any]) -> None:
    with closing(connect(config)) as connection:
        with closing(connection.cursor()) as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()


def list_tables(config: dict[str, Any]) -> list[str]:
    schema = str(config.get("schema") or "dbo").strip()
    try:
        with closing(connect(config)) as connection:
            with closing(connection.cursor()) as cursor:
                cursor.execute(
                    """
                    SELECT TABLE_NAME
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
                    ORDER BY TABLE_NAME
                    """,
                    schema,
                )
                return [str(row[0]) for row in cursor.fetchall()]
    except DatabaseConnectionError:
        raise
    except Exception as exc:
        raise DatabaseConnectionError(_friendly_error(exc)) from exc


def load_table_schema(
    config: dict[str, Any],
    table_name: str,
    cancellation: CancellationController | None = None,
) -> dict[str, Any]:
    schema = str(config.get("schema") or "dbo").strip()
    try:
        with closing(connect(config)) as connection:
            with closing(connection.cursor()) as cursor:
                cancel = lambda: _cancel_operation(cursor, connection)
                if cancellation:
                    cancellation.register(cancel)
                try:
                    return _load_table_schema(cursor, schema, table_name)
                finally:
                    if cancellation:
                        cancellation.unregister(cancel)
    except (DatabaseConnectionError, DatabaseConfigurationError):
        raise
    except Exception as exc:
        raise DatabaseConnectionError(_friendly_error(exc)) from exc


def _load_table_schema(cursor, schema: str, table_name: str) -> dict[str, Any]:
                cursor.execute(
                    """
                    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE,
                           CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION,
                           NUMERIC_SCALE, DATETIME_PRECISION
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                    ORDER BY ORDINAL_POSITION
                    """,
                    schema,
                    table_name,
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
                        f'SQL Server table "{table_name}" was not found in schema "{schema}".'
                    )
                cursor.execute(
                    """
                    SELECT i.is_primary_key, i.name, c.name, ic.key_ordinal
                    FROM sys.indexes i
                    JOIN sys.index_columns ic
                      ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                    JOIN sys.columns c
                      ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    JOIN sys.tables t ON i.object_id = t.object_id
                    JOIN sys.schemas s ON t.schema_id = s.schema_id
                    WHERE s.name = ? AND t.name = ?
                      AND (i.is_primary_key = 1 OR i.is_unique = 1)
                      AND i.has_filter = 0
                      AND ic.key_ordinal > 0
                    ORDER BY i.is_primary_key DESC, i.index_id, ic.key_ordinal
                    """,
                    schema,
                    table_name,
                )
                keys: dict[tuple[bool, str], list[str]] = {}
                for row in cursor.fetchall():
                    keys.setdefault((bool(row[0]), str(row[1])), []).append(str(row[2]))
                primary_key = next(
                    (value for (is_primary, _), value in keys.items() if is_primary), []
                )
                unique_keys = [
                    value for (is_primary, _), value in keys.items() if not is_primary
                ]
                return {
                    "columns": columns,
                    "primary_key": primary_key,
                    "unique_keys": unique_keys,
                }
def count_table_rows(
    config: dict[str, Any],
    table_name: str,
    cancellation: CancellationController | None = None,
) -> int:
    """Return an exact count without loading table rows into Python."""
    schema = str(config.get("schema") or "dbo").strip()
    qualified_table = f"{_quote_identifier(schema)}.{_quote_identifier(table_name)}"
    try:
        with closing(connect(config)) as connection:
            with closing(connection.cursor()) as cursor:
                cancel = lambda: _cancel_operation(cursor, connection)
                if cancellation:
                    cancellation.register(cancel)
                try:
                    cursor.execute(f"SELECT COUNT_BIG(*) FROM {qualified_table}")
                    row = cursor.fetchone()
                    return int(row[0])
                finally:
                    if cancellation:
                        cancellation.unregister(cancel)
    except DatabaseConnectionError:
        raise
    except Exception as exc:
        raise DatabaseConnectionError(_friendly_error(exc)) from exc


def iter_table_rows(
    config: dict[str, Any],
    table_name: str,
    columns: list[str],
    key_columns: list[str],
    batch_size: int,
    cancellation: CancellationController | None = None,
) -> Iterator[tuple[Any, ...]]:
    """Yield ordered rows without retaining the full table in memory."""
    if not columns or not key_columns:
        raise DatabaseConfigurationError("Columns and comparison keys are required.")
    schema = str(config.get("schema") or "dbo").strip()
    qualified_table = f"{_quote_identifier(schema)}.{_quote_identifier(table_name)}"
    select_columns = ", ".join(_quote_identifier(value) for value in columns)
    order_columns = ", ".join(_quote_identifier(value) for value in key_columns)
    connection = connect(config)
    cursor = connection.cursor()
    cancel = lambda: _cancel_operation(cursor, connection)
    if cancellation:
        cancellation.register(cancel)
    try:
        cursor.execute(
            f"SELECT {select_columns} FROM {qualified_table} ORDER BY {order_columns}"
        )
        while True:
            rows = cursor.fetchmany(batch_size)
            if not rows:
                break
            for row in rows:
                yield tuple(row)
    except DatabaseConnectionError:
        raise
    except Exception as exc:
        raise DatabaseConnectionError(_friendly_error(exc)) from exc
    finally:
        if cancellation:
            cancellation.unregister(cancel)
        try:
            cursor.close()
        finally:
            connection.close()


def _cancel_operation(cursor, connection) -> None:
    try:
        cursor.cancel()
    finally:
        connection.close()


def _quote_identifier(value: str) -> str:
    return "[" + value.replace("]", "]]") + "]"


def _friendly_error(error: Exception) -> str:
    text = str(error).lower()
    if (
        "login failed" in text
        or "authentication failed" in text
        or "28000" in text
        or "18456" in text
    ):
        return "SQL Server rejected the login. Check the authentication type, username, and password."
    if "certificate" in text or "ssl provider" in text:
        return "SQL Server certificate validation failed. Verify the certificate or enable Trust server certificate for an approved internal server."
    if (
        "data source name not found" in text
        or "specified driver could not be loaded" in text
        or "im002" in text
        or "im003" in text
    ):
        return "The selected SQL Server ODBC driver is unavailable. Install Microsoft ODBC Driver 18 or choose an installed driver."
    if "cannot open database" in text or "4060" in text:
        return "SQL Server was reached, but the selected database could not be opened. Check the database name and the login's access."
    if "timeout" in text or "hyt00" in text or "hyt01" in text:
        return "The SQL Server connection timed out. Check the server address and network access."
    if (
        "server does not exist" in text
        or "could not open a connection" in text
        or "network-related" in text
        or "tcp provider" in text
        or "named pipes provider" in text
        or "connection refused" in text
        or "actively refused" in text
        or "08001" in text
        or "08004" in text
        or "error 26" in text
        or "error 40" in text
    ):
        return "SQL Server could not be reached. Check the server or instance name, port, SQL Server service, TCP/IP, network, and firewall."
    return "SQL Server connection failed. Check the server, database, authentication, and SQL Server availability."
