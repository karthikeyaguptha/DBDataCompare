from flask import Flask

from db_compare.web import web


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
    app.config.from_mapping(
        SECRET_KEY=None,
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=64 * 1024,
    )

    if test_config:
        app.config.update(test_config)

    app.register_blueprint(web)
    return app
