from pathlib import Path

from flask import Flask

from db_compare.web import web


def create_app(test_config: dict | None = None) -> Flask:
    project_root = Path(__file__).resolve().parent.parent
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
    app.config.from_mapping(
        SECRET_KEY=None,
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        REPORTS_DIR=project_root / "reports",
        PROFILES_FILE=project_root / "config" / "profiles.json",
    )

    if test_config:
        app.config.update(test_config)

    app.register_blueprint(web)
    return app
