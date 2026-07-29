from pathlib import Path

from flask import Flask

from db_compare import _prepare_runtime_storage, create_app


def test_application_uses_organized_web_and_data_folders():
    app = create_app()
    project_root = Path(__file__).resolve().parent.parent
    flask_root = Path(app.root_path)

    assert (flask_root / app.template_folder).resolve() == project_root / "web" / "templates"
    assert (flask_root / app.static_folder).resolve() == project_root / "web" / "static"
    assert Path(app.config["REPORTS_DIR"]) == project_root / "data" / "reports"
    assert Path(app.config["PROFILES_FILE"]) == (
        project_root / "data" / "config" / "profiles.json"
    )
    assert Path(app.config["TABLE_SETS_FILE"]) == (
        project_root / "data" / "config" / "table-sets.json"
    )


def test_legacy_runtime_files_are_moved_without_overwriting_new_files(tmp_path):
    legacy_config = tmp_path / "config"
    legacy_reports = tmp_path / "reports"
    data_config = tmp_path / "data" / "config"
    data_reports = tmp_path / "data" / "reports"

    legacy_config.mkdir()
    legacy_reports.mkdir()
    data_config.mkdir(parents=True)
    data_reports.mkdir(parents=True)

    (legacy_config / "profiles.json").write_text("legacy profiles", encoding="utf-8")
    (legacy_config / "table-sets.json").write_text("legacy tables", encoding="utf-8")
    (legacy_reports / "old-run.json").write_text("legacy report", encoding="utf-8")
    (data_config / "profiles.json").write_text("current profiles", encoding="utf-8")

    app = Flask(__name__)
    app.config.update(
        REPORTS_DIR=data_reports,
        PROFILES_FILE=data_config / "profiles.json",
        TABLE_SETS_FILE=data_config / "table-sets.json",
    )

    _prepare_runtime_storage(app, tmp_path, migrate_legacy=True)

    assert (data_config / "profiles.json").read_text(encoding="utf-8") == "current profiles"
    assert (legacy_config / "profiles.json").read_text(encoding="utf-8") == "legacy profiles"
    assert (data_config / "table-sets.json").read_text(encoding="utf-8") == "legacy tables"
    assert (data_reports / "old-run.json").read_text(encoding="utf-8") == "legacy report"
    assert not (legacy_config / "table-sets.json").exists()
    assert not (legacy_reports / "old-run.json").exists()
