import pytest

from db_compare.db.errors import DatabaseConfigurationError
from db_compare.db.sqlserver import _connection_string, _friendly_error


def test_sql_server_authentication_connection_string():
    value = _connection_string(
        {
            "server": "localhost",
            "port": "1433",
            "database": "source",
            "authentication": "credentials",
            "username": "reader",
            "password": "safe-password",
            "driver": "ODBC Driver 18 for SQL Server",
            "trust_server_certificate": True,
        }
    )

    assert "SERVER={localhost,1433}" in value
    assert "UID={reader}" in value
    assert "PWD={safe-password}" in value
    assert "Trusted_Connection" not in value
    assert "TrustServerCertificate=yes" in value


def test_windows_authentication_does_not_require_credentials():
    value = _connection_string(
        {
            "server": "localhost",
            "database": "source",
            "authentication": "windows",
        }
    )

    assert "Trusted_Connection=yes" in value
    assert "UID=" not in value
    assert "PWD=" not in value


def test_sql_server_requires_database():
    with pytest.raises(DatabaseConfigurationError, match="database is required"):
        _connection_string({"server": "localhost"})


def test_driver_name_in_network_error_is_not_reported_as_missing_driver():
    error = Exception(
        "[Microsoft][ODBC Driver 18 for SQL Server]TCP Provider: "
        "A network-related error occurred (08001)"
    )

    assert "could not be reached" in _friendly_error(error)


def test_missing_driver_sqlstate_is_reported_as_missing_driver():
    error = Exception("[unixODBC][Driver Manager]Data source name not found (IM002)")

    assert "ODBC driver is unavailable" in _friendly_error(error)


def test_database_access_error_is_reported_separately():
    error = Exception(
        "[Microsoft][ODBC Driver 18 for SQL Server]Cannot open database requested by the login (4060)"
    )

    assert "database could not be opened" in _friendly_error(error)
