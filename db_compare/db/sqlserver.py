"""Microsoft SQL Server connectivity through pyodbc."""

from __future__ import annotations

from contextlib import closing
from typing import Any

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


def _friendly_error(error: Exception) -> str:
    text = str(error).lower()
    if "login failed" in text or "authentication" in text:
        return "SQL Server rejected the login. Check the authentication type, username, and password."
    if "server does not exist" in text or "could not open a connection" in text:
        return "SQL Server could not be reached. Check the server, port, network, and firewall."
    if "certificate" in text or "ssl provider" in text:
        return "SQL Server certificate validation failed. Verify the certificate or enable Trust server certificate for an approved internal server."
    if "data source name not found" in text or "driver" in text:
        return "The selected SQL Server ODBC driver is unavailable. Install Microsoft ODBC Driver 18 or choose an installed driver."
    if "timeout" in text:
        return "The SQL Server connection timed out. Check the server address and network access."
    return "SQL Server connection failed. Check the supplied details and database availability."
