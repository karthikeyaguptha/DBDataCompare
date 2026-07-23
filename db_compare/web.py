from flask import Blueprint, jsonify, render_template


web = Blueprint("web", __name__)


@web.get("/")
def index():
    return render_template("index.html")


@web.get("/api/health")
def health():
    return jsonify(
        {
            "application": "DB Compare Studio",
            "status": "ready",
            "phase": "v0.1.0-project-setup",
        }
    )

