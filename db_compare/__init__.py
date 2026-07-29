from pathlib import Path
import shutil

from flask import Flask

from db_compare.reporting import format_duration
from db_compare.web import web


def create_app(test_config: dict | None = None) -> Flask:
    project_root = Path(__file__).resolve().parent.parent
    app = Flask(
        __name__,
        template_folder="../web/templates",
        static_folder="../web/static",
    )
    app.config.from_mapping(
        SECRET_KEY=None,
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        REPORTS_DIR=project_root / "data" / "reports",
        PROFILES_FILE=project_root / "data" / "config" / "profiles.json",
        TABLE_SETS_FILE=project_root / "data" / "config" / "table-sets.json",
        SETTINGS_FILE=project_root / "data" / "config" / "app-settings.json",
    )

    if test_config:
        app.config.update(test_config)

    _prepare_runtime_storage(app, project_root, migrate_legacy=test_config is None)
    app.jinja_env.filters["duration"] = format_duration
    app.register_blueprint(web)
    return app


def _prepare_runtime_storage(
    app: Flask,
    project_root: Path,
    *,
    migrate_legacy: bool,
) -> None:
    reports_dir = Path(app.config["REPORTS_DIR"])
    profiles_file = Path(app.config["PROFILES_FILE"])
    table_sets_file = Path(app.config["TABLE_SETS_FILE"])
    settings_file = Path(
        app.config.get("SETTINGS_FILE", profiles_file.parent / "app-settings.json")
    )

    reports_dir.mkdir(parents=True, exist_ok=True)
    profiles_file.parent.mkdir(parents=True, exist_ok=True)

    if not migrate_legacy:
        return

    legacy_config = project_root / "config"
    for legacy_file, destination in (
        (legacy_config / "profiles.json", profiles_file),
        (legacy_config / "table-sets.json", table_sets_file),
        (legacy_config / "app-settings.json", settings_file),
    ):
        if legacy_file.is_file() and not destination.exists():
            shutil.move(str(legacy_file), str(destination))

    legacy_reports = project_root / "reports"
    if legacy_reports.is_dir() and legacy_reports != reports_dir:
        for item in legacy_reports.iterdir():
            destination = reports_dir / item.name
            if not destination.exists():
                shutil.move(str(item), str(destination))
