import pytest

from db_compare.db import DatabaseConfigurationError
from db_compare.settings import datatype_mapping_lookup, load_settings, save_settings


def test_missing_settings_file_uses_backward_compatible_defaults(tmp_path):
    settings = load_settings(tmp_path / "missing.json")

    assert settings["notification_duration_seconds"] == 5
    assert datatype_mapping_lookup(settings)["int"] == {"integer"}
    assert datatype_mapping_lookup(settings)["timestamp"] == {"bytea"}


def test_duplicate_and_invalid_settings_are_rejected(tmp_path):
    path = tmp_path / "settings.json"
    with pytest.raises(DatabaseConfigurationError, match="more than once"):
        save_settings(
            path,
            {
                "notification_duration_seconds": 5,
                "datatype_mappings": [
                    {"sqlserver": "int", "postgres": ["integer"]},
                    {"sqlserver": "INT", "postgres": ["bigint"]},
                ],
            },
        )
