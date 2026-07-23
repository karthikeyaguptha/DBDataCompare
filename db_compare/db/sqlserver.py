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
