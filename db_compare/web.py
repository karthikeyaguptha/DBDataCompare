from math import ceil
from pathlib import Path
from secrets import token_urlsafe
from threading import Event, Lock, Thread
from time import monotonic
from typing import Any

from flask import Blueprint, current_app, jsonify, render_template, request, send_file

from .cancellation import CancellationController
from .comparison import compare_table_data, compare_table_row_counts, compare_table_schema
from .db import (
    DatabaseConfigurationError,
    DatabaseConnectionError,
    load_table_names,
    test_database_connection,
)
from .profiles import delete_profile, list_profiles, save_profile
from .reporting import (
    create_report_run,
    finalize_report_run,
    mismatch_writer,
    dashboard_mismatch_page,
    report_file,
    report_summary,
)


web = Blueprint("web", __name__)

_TABLE_CATALOG_TTL_SECONDS = 30 * 60
_TABLE_CATALOG_LIMIT = 8
_TABLE_CATALOGS: dict[str, dict[str, Any]] = {}
_TABLE_CATALOG_LOCK = Lock()
_DATA_JOB_TTL_SECONDS = 30 * 60
_DATA_JOB_LIMIT = 4
_DATA_JOBS: dict[str, dict[str, Any]] = {}
_DATA_JOB_LOCK = Lock()
_ACTIVE_OPERATIONS: dict[str, CancellationController] = {}
_ACTIVE_OPERATIONS_LOCK = Lock()


@web.get("/")
def index():
    return render_template("index.html")


@web.get("/api/health")
def health():
    return jsonify(
        {
            "application": "Data Sync Check",
            "status": "ready",
            "phase": "v1.2.0-brand-placement",
        }
    )


@web.get("/api/profiles")
def profiles():
    return jsonify(
        {
            "status": "ready",
            "profiles": list_profiles(Path(current_app.config["PROFILES_FILE"])),
        }
    )


@web.post("/api/profiles")
def store_profile():
    profile = save_profile(
        Path(current_app.config["PROFILES_FILE"]),
        _json_body(),
    )
    return jsonify(
        {
            "status": "saved",
            "message": f'Profile "{profile["name"]}" saved without passwords.',
            "profile": profile,
        }
    )


@web.delete("/api/profiles/<profile_id>")
def remove_profile(profile_id: str):
    delete_profile(Path(current_app.config["PROFILES_FILE"]), profile_id)
    return jsonify({"status": "deleted", "message": "Saved profile deleted."})


@web.post("/api/reports/runs")
def begin_report_run():
    payload = _json_body()
    selected_tables = payload.get("selected_tables")
    if not isinstance(selected_tables, list) or any(
        not isinstance(item, str) for item in selected_tables
    ):
        raise DatabaseConfigurationError("Selected report tables must be a valid list.")
    run = create_report_run(
        Path(current_app.config["REPORTS_DIR"]),
        mode=str(payload.get("comparison_mode", "full")),
        selected_tables=selected_tables,
    )
    return jsonify({"status": "started", **run}), 201


@web.post("/api/reports/<run_id>/finalize")
def finalize_report(run_id: str):
    result = finalize_report_run(
        Path(current_app.config["REPORTS_DIR"]),
        run_id,
        _json_body(),
    )
    return jsonify(result)


@web.get("/api/reports/<run_id>/<kind>")
def download_report(run_id: str, kind: str):
    path = report_file(Path(current_app.config["REPORTS_DIR"]), run_id, kind)
    return send_file(path, as_attachment=True, download_name=path.name)


@web.get("/reports/<run_id>/dashboard")
def comparison_dashboard(run_id: str):
    summary = report_summary(Path(current_app.config["REPORTS_DIR"]), run_id)
    return render_template("dashboard.html", summary=summary)


@web.get("/api/reports/<run_id>/dashboard-data")
def comparison_dashboard_data(run_id: str):
    try:
        page = max(1, int(request.args.get("page", 1)))
        page_size = int(request.args.get("page_size", 50))
    except (TypeError, ValueError) as exc:
        raise DatabaseConfigurationError("Report page values must be valid numbers.") from exc
    return jsonify(
        {
            "status": "ready",
            **dashboard_mismatch_page(
                Path(current_app.config["REPORTS_DIR"]),
                run_id,
                page=page,
                page_size=page_size,
                table_id=str(request.args.get("table", "")),
                kind=str(request.args.get("kind", "")),
                search=str(request.args.get("search", "")),
            ),
        }
    )


@web.post("/api/connections/test")
def test_connection():
    payload = _json_body()
    database_type = str(payload.get("database_type", ""))
    config = payload.get("connection")
    if not isinstance(config, dict):
        raise DatabaseConfigurationError("Connection details are required.")

    test_database_connection(database_type, config)
    name = "SQL Server" if database_type == "sqlserver" else "PostgreSQL"
    return jsonify({"status": "connected", "message": f"{name} connection succeeded."})


@web.post("/api/tables")
def tables():
    payload = _json_body()
    sqlserver_config = payload.get("sqlserver")
    postgres_config = payload.get("postgres")
    if not isinstance(sqlserver_config, dict) or not isinstance(postgres_config, dict):
        raise DatabaseConfigurationError("Both database connections are required.")

    try:
        page = max(1, int(payload.get("page", 1)))
        page_size = int(payload.get("page_size", 10))
    except (TypeError, ValueError) as exc:
        raise DatabaseConfigurationError("Page and page size must be valid numbers.") from exc
    if page_size not in {5, 10, 25, 50, 100}:
        raise DatabaseConfigurationError("Choose a supported page size.")

    catalog_token = str(payload.get("catalog_token", "")).strip()
    rows = _get_table_catalog(catalog_token) if catalog_token else None
    if rows is None:
        sql_names, pg_names = load_table_names(sqlserver_config, postgres_config)
        rows = _merge_table_names(sql_names, pg_names)
        catalog_token = _store_table_catalog(rows)

    search = str(payload.get("search", "")).strip().casefold()
    statuses = payload.get("statuses", ["available"])
    if not isinstance(statuses, list) or any(not isinstance(status, str) for status in statuses):
        raise DatabaseConfigurationError("Table status filters must be a list.")
    supported_statuses = {"available", "sql_only", "postgres_only"}
    status_filter = set(statuses)
    if not status_filter <= supported_statuses:
        raise DatabaseConfigurationError("Choose supported table status filters.")

    rows = [row for row in rows if row["status"] in status_filter]
    if search:
        rows = [
            row
            for row in rows
            if search in (row["sqlserver"] or "").casefold()
            or search in (row["postgres"] or "").casefold()
        ]

    total = len(rows)
    total_pages = max(1, ceil(total / page_size))
    page = min(page, total_pages)
    start = (page - 1) * page_size
    return jsonify(
        {
            "status": "ready",
            "catalog_token": catalog_token,
            "tables": rows[start : start + page_size],
            "matching_ids": [row["id"] for row in rows],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
            },
        }
    )


@web.post("/api/schema/compare")
def compare_schema():
    payload = _json_body()
    sqlserver_config = payload.get("sqlserver")
    postgres_config = payload.get("postgres")
    if not isinstance(sqlserver_config, dict) or not isinstance(postgres_config, dict):
        raise DatabaseConfigurationError("Both database connections are required.")

    token = str(payload.get("catalog_token", "")).strip()
    table_id = str(payload.get("table_id", "")).strip().casefold()
    if not token or not table_id:
        raise DatabaseConfigurationError("A loaded table catalog and table are required.")
    rows = _get_table_catalog(token)
    if rows is None:
        raise DatabaseConfigurationError(
            "The table catalog expired. Reload tables and try again."
        )
    table = next((row for row in rows if row["id"] == table_id), None)
    if table is None:
        raise DatabaseConfigurationError("The selected table is unavailable.")

    operation_id = _operation_id(payload)
    controller = _begin_operation(operation_id) if operation_id else None
    try:
        kwargs = {"cancellation": controller} if controller else {}
        result = compare_table_schema(
            sqlserver_config,
            postgres_config,
            table["sqlserver"],
            table["postgres"],
            **kwargs,
        )
    finally:
        if operation_id:
            _finish_operation(operation_id)
    return jsonify({"status": "ready", "table_id": table_id, "result": result})


@web.post("/api/counts/compare")
def compare_counts():
    payload = _json_body()
    sqlserver_config = payload.get("sqlserver")
    postgres_config = payload.get("postgres")
    if not isinstance(sqlserver_config, dict) or not isinstance(postgres_config, dict):
        raise DatabaseConfigurationError("Both database connections are required.")

    table_id, table = _catalog_table_from_payload(payload)
    operation_id = _operation_id(payload)
    controller = _begin_operation(operation_id) if operation_id else None
    try:
        kwargs = {"cancellation": controller} if controller else {}
        result = compare_table_row_counts(
            sqlserver_config,
            postgres_config,
            table["sqlserver"],
            table["postgres"],
            **kwargs,
        )
    finally:
        if operation_id:
            _finish_operation(operation_id)
    return jsonify({"status": "ready", "table_id": table_id, "result": result})


@web.post("/api/operations/<operation_id>/cancel-now")
def cancel_active_operation(operation_id: str):
    controller = _active_operation(operation_id)
    if controller is None:
        return jsonify(
            {
                "status": "not_active",
                "message": "The database operation already finished or is unavailable.",
            }
        )
    targets = controller.cancel_now()
    return jsonify(
        {
            "status": "cancelling",
            "targets": targets,
            "message": "Immediate database cancellation requested.",
        }
    )


@web.post("/api/data/compare/start")
def start_data_compare():
    payload = _json_body()
    sqlserver_config = payload.get("sqlserver")
    postgres_config = payload.get("postgres")
    if not isinstance(sqlserver_config, dict) or not isinstance(postgres_config, dict):
        raise DatabaseConfigurationError("Both database connections are required.")
    table_id, table = _catalog_table_from_payload(payload)
    if not table["sqlserver"] or not table["postgres"]:
        raise DatabaseConfigurationError(
            "Row data comparison requires the table in both databases."
        )
    try:
        batch_size = int(payload.get("batch_size", 5000))
    except (TypeError, ValueError) as exc:
        raise DatabaseConfigurationError("Batch size must be a valid number.") from exc
    if batch_size not in {2000, 5000, 10000}:
        raise DatabaseConfigurationError("Choose a supported batch size.")
    manual_key = payload.get("comparison_key") or []
    if not isinstance(manual_key, list) or any(
        not isinstance(value, str) or not value.strip() for value in manual_key
    ):
        raise DatabaseConfigurationError("Comparison key columns must be a valid list.")
    comparison_options = payload.get("options") or {}
    if not isinstance(comparison_options, dict):
        raise DatabaseConfigurationError("Comparison options must be valid.")
    report_run_id = str(payload.get("report_run_id", "")).strip()
    reports_root = Path(current_app.config["REPORTS_DIR"])
    writer = (
        mismatch_writer(
            reports_root,
            report_run_id,
            table_id,
            str(table["sqlserver"]),
            str(table["postgres"]),
        )
        if report_run_id
        else None
    )

    job_id = token_urlsafe(24)
    cancel_event = Event()
    immediate_cancel_event = Event()
    cancellation = CancellationController()
    now = monotonic()
    job = {
        "id": job_id,
        "table_id": table_id,
        "status": "queued",
        "processed": 0,
        "result": None,
        "error": None,
        "cancel": cancel_event,
        "cancel_now": immediate_cancel_event,
        "cancellation": cancellation,
        "last_accessed": now,
    }
    with _DATA_JOB_LOCK:
        _remove_expired_jobs(now)
        active_jobs = sum(
            item["status"] in {"queued", "running"} for item in _DATA_JOBS.values()
        )
        if active_jobs >= _DATA_JOB_LIMIT:
            raise DatabaseConfigurationError(
                "Too many data comparisons are already running. Wait for one to finish."
            )
        _DATA_JOBS[job_id] = job

    worker = Thread(
        target=_run_data_job,
        args=(
            job_id,
            sqlserver_config,
            postgres_config,
            table,
            [value.strip() for value in manual_key],
            batch_size,
            comparison_options,
            writer,
        ),
        daemon=True,
        name=f"data-compare-{table_id[:24]}",
    )
    worker.start()
    return jsonify({"status": "started", "job_id": job_id, "table_id": table_id}), 202


@web.get("/api/data/compare/<job_id>")
def data_compare_status(job_id: str):
    job = _get_data_job(job_id)
    if job is None:
        raise DatabaseConfigurationError("The data comparison job expired or is unavailable.")
    return jsonify(
        {
            "status": job["status"],
            "table_id": job["table_id"],
            "processed": job["processed"],
            "result": job["result"],
            "message": job["error"],
        }
    )


@web.post("/api/data/compare/<job_id>/cancel")
def cancel_data_compare(job_id: str):
    job = _get_data_job(job_id)
    if job is None:
        raise DatabaseConfigurationError("The data comparison job expired or is unavailable.")
    job["cancel"].set()
    return jsonify({"status": "cancelling", "table_id": job["table_id"]})


@web.post("/api/data/compare/<job_id>/cancel-now")
def cancel_data_compare_now(job_id: str):
    job = _get_data_job(job_id)
    if job is None:
        raise DatabaseConfigurationError("The data comparison job expired or is unavailable.")
    job["cancel_now"].set()
    job["cancel"].set()
    targets = job["cancellation"].cancel_now()
    return jsonify(
        {
            "status": "cancelling_immediately",
            "table_id": job["table_id"],
            "targets": targets,
        }
    )


def _catalog_table_from_payload(
    payload: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    token = str(payload.get("catalog_token", "")).strip()
    table_id = str(payload.get("table_id", "")).strip().casefold()
    if not token or not table_id:
        raise DatabaseConfigurationError("A loaded table catalog and table are required.")
    rows = _get_table_catalog(token)
    if rows is None:
        raise DatabaseConfigurationError(
            "The table catalog expired. Reload tables and try again."
        )
    table = next((row for row in rows if row["id"] == table_id), None)
    if table is None:
        raise DatabaseConfigurationError("The selected table is unavailable.")
    return table_id, table


def _store_table_catalog(rows: list[dict[str, Any]]) -> str:
    now = monotonic()
    token = token_urlsafe(24)
    with _TABLE_CATALOG_LOCK:
        _remove_expired_catalogs(now)
        while len(_TABLE_CATALOGS) >= _TABLE_CATALOG_LIMIT:
            oldest_token = min(
                _TABLE_CATALOGS,
                key=lambda item: _TABLE_CATALOGS[item]["last_accessed"],
            )
            del _TABLE_CATALOGS[oldest_token]
        _TABLE_CATALOGS[token] = {
            "rows": rows,
            "last_accessed": now,
        }
    return token


def _get_table_catalog(token: str) -> list[dict[str, Any]] | None:
    now = monotonic()
    with _TABLE_CATALOG_LOCK:
        _remove_expired_catalogs(now)
        catalog = _TABLE_CATALOGS.get(token)
        if catalog is None:
            return None
        catalog["last_accessed"] = now
        return catalog["rows"]


def _remove_expired_catalogs(now: float) -> None:
    expired = [
        token
        for token, catalog in _TABLE_CATALOGS.items()
        if now - catalog["last_accessed"] > _TABLE_CATALOG_TTL_SECONDS
    ]
    for token in expired:
        del _TABLE_CATALOGS[token]


def _run_data_job(
    job_id: str,
    sqlserver_config: dict[str, Any],
    postgres_config: dict[str, Any],
    table: dict[str, Any],
    manual_key: list[str],
    batch_size: int,
    options: dict[str, Any],
    writer,
) -> None:
    job = _get_data_job(job_id)
    if job is None:
        return
    job["status"] = "running"

    def report_progress(processed: int) -> None:
        current = _get_data_job(job_id)
        if current is not None:
            current["processed"] = processed

    try:
        schema_result = compare_table_schema(
            sqlserver_config,
            postgres_config,
            table["sqlserver"],
            table["postgres"],
            cancellation=job["cancellation"],
        )
        comparison_key = manual_key or schema_result.get("comparison_key") or []
        if not comparison_key:
            raise DatabaseConfigurationError(
                "No matching primary or unique key was found. Enter a manual comparison key."
            )
        result = compare_table_data(
            sqlserver_config,
            postgres_config,
            table["sqlserver"],
            table["postgres"],
            schema_result,
            comparison_key,
            batch_size=batch_size,
            options=options,
            cancel_requested=job["cancel"].is_set,
            immediate_cancel_requested=job["cancel_now"].is_set,
            cancellation=job["cancellation"],
            progress=report_progress,
            mismatch_sink=writer,
        )
        job["result"] = result
        job["processed"] = result["processed"]
        job["status"] = (
            "stopped_immediately"
            if result["status"] == "stopped_immediately"
            else "cancelled"
            if result["status"] == "cancelled"
            else "complete"
        )
    except (DatabaseConfigurationError, DatabaseConnectionError) as exc:
        if job["cancel_now"].is_set():
            job["result"] = {
                "status": "stopped_immediately",
                "summary": "Data comparison stopped immediately; only completed work was preserved.",
                "processed": job["processed"],
                "counts": {
                    "matched": 0,
                    "different": 0,
                    "sql_only": 0,
                    "postgres_only": 0,
                },
                "mismatch_total": 0,
                "preview": [],
                "preview_limited": False,
            }
            job["status"] = "stopped_immediately"
        else:
            job["error"] = str(exc)
            job["status"] = "error"
    except Exception:
        job["error"] = (
            "Data comparison failed unexpectedly. Review the database availability "
            "and comparison key, then try again."
        )
        job["status"] = "error"
    finally:
        job["last_accessed"] = monotonic()


def _get_data_job(job_id: str) -> dict[str, Any] | None:
    now = monotonic()
    with _DATA_JOB_LOCK:
        _remove_expired_jobs(now)
        job = _DATA_JOBS.get(job_id)
        if job is not None:
            job["last_accessed"] = now
        return job


def _remove_expired_jobs(now: float) -> None:
    expired = [
        job_id
        for job_id, job in _DATA_JOBS.items()
        if job["status"] not in {"queued", "running"}
        and now - job["last_accessed"] > _DATA_JOB_TTL_SECONDS
    ]
    for job_id in expired:
        del _DATA_JOBS[job_id]


def _operation_id(payload: dict[str, Any]) -> str:
    value = str(payload.get("operation_id", "")).strip()
    if value and (len(value) > 80 or not all(char.isalnum() or char in "-_" for char in value)):
        raise DatabaseConfigurationError("The comparison operation identifier is invalid.")
    return value


def _begin_operation(operation_id: str) -> CancellationController:
    controller = CancellationController()
    with _ACTIVE_OPERATIONS_LOCK:
        _ACTIVE_OPERATIONS[operation_id] = controller
    return controller


def _finish_operation(operation_id: str) -> None:
    with _ACTIVE_OPERATIONS_LOCK:
        _ACTIVE_OPERATIONS.pop(operation_id, None)


def _active_operation(operation_id: str) -> CancellationController | None:
    with _ACTIVE_OPERATIONS_LOCK:
        return _ACTIVE_OPERATIONS.get(operation_id)


def _merge_table_names(sql_names: list[str], pg_names: list[str]) -> list[dict[str, Any]]:
    sql_lookup = {name.casefold(): name for name in sql_names}
    pg_lookup = {name.casefold(): name for name in pg_names}
    rows: list[dict[str, Any]] = []
    for key in sorted(set(sql_lookup) | set(pg_lookup)):
        sql_name = sql_lookup.get(key)
        pg_name = pg_lookup.get(key)
        if sql_name and pg_name:
            status = "available"
        elif sql_name:
            status = "sql_only"
        else:
            status = "postgres_only"
        rows.append(
            {
                "id": key,
                "sqlserver": sql_name,
                "postgres": pg_name,
                "status": status,
            }
        )
    return rows


def _json_body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise DatabaseConfigurationError("A valid JSON request is required.")
    return payload


@web.app_errorhandler(DatabaseConfigurationError)
def handle_configuration_error(error: DatabaseConfigurationError):
    return jsonify({"status": "error", "message": str(error)}), 400


@web.app_errorhandler(DatabaseConnectionError)
def handle_connection_error(error: DatabaseConnectionError):
    return jsonify({"status": "error", "message": str(error)}), 503


@web.app_errorhandler(500)
def handle_unexpected_error(_error):
    return (
        jsonify(
            {
                "status": "error",
                "message": "An unexpected local application error occurred. Check the execution log.",
            }
        ),
        500,
    )
