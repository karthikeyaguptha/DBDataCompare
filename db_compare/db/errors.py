"""Safe, user-facing database errors."""


class DatabaseConfigurationError(ValueError):
    """Raised when required connection details are missing or invalid."""


class DatabaseConnectionError(RuntimeError):
    """Raised when a database operation fails without exposing credentials."""
