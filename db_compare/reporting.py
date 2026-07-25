"""Local, credential-safe comparison report persistence."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from secrets import token_hex
from threading import Lock
from typing import Any, Callable

from .db.errors import DatabaseConfigurationError


_RUN_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{8,80}$")
_REPORT_KINDS = {
    "summary": "run-summary.json",
    "mismatches": "mismatches.jsonl",
    "csv": "comparison-summary.csv",
    "log": "execution.log",
}
_WRITE_LOCK = Lock()


def create_report_run(
    reports_root: Path,
    *,
    mode: str,
    selected_tables: list[str],
) -> dict[str, Any]:
    reports_root.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc)
    run_id = f"{timestamp:%Y%m%dT%H%M%SZ}-{token_hex(4)}"
    run_dir = reports_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    (run_dir / _REPORT_KINDS["mismatches"]).touch()
    manifest = {
        "format_version": 1,
        "run_id": run_id,
        "status": "running",
        "started_at": timestamp.isoformat(),
        "mode": _safe_mode(mode),
        "selected_tables": _safe_table_ids(selected_tables),
    }
    _write_json(run_dir / "manifest.json", manifest)
    return {"run_id": run_id, "started_at": manifest["started_at"]}


def mismatch_writer(
    reports_root: Path,
    run_id: str,
    table_id: str,
    sqlserver_table: str,
    postgres_table: str,
) -> Callable[[dict[str, Any]], None]:
    run_dir = report_run_directory(reports_root, run_id)
    path = run_dir / _REPORT_KINDS["mismatches"]

    def write(item: dict[str, Any]) -> None:
        record = {
            "table_id": table_id,
            "sqlserver_table": sqlserver_table,
            "postgres_table": postgres_table,
            **item,
        }
        try:
            line = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
            with _WRITE_LOCK, path.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(line)
                handle.write("\n")
        except (OSError, TypeError, ValueError) as exc:
            raise DatabaseConfigurationError(
                "A complete mismatch report could not be written. Check the reports folder."
            ) from exc

    return write


def finalize_report_run(
    reports_root: Path,
    run_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    run_dir = report_run_directory(reports_root, run_id)
    tables = payload.get("tables")
    log_entries = payload.get("log_entries")
    if not isinstance(tables, list) or not isinstance(log_entries, list):
        raise DatabaseConfigurationError("Report tables and execution log are required.")
    if len(tables) > 10_000 or len(log_entries) > 20_000:
        raise DatabaseConfigurationError("The report contains too many summary items.")

    completed_at = datetime.now(timezone.utc).isoformat()
    stop_mode = _safe_text(payload.get("stop_mode"), 20)
    status = (
        "stopped_immediately"
        if payload.get("cancelled") and stop_mode == "immediate"
        else "cancelled"
        if payload.get("cancelled")
        else "complete"
    )
    safe_tables = [_safe_table_summary(item) for item in tables if isinstance(item, dict)]
    summary = {
        "format_version": 1,
        "run_id": run_id,
        "status": status,
        "stop_mode": stop_mode if payload.get("cancelled") else "",
        "started_at": _safe_text(payload.get("started_at"), 80),
        "completed_at": completed_at,
        "duration_seconds": _safe_nonnegative_number(payload.get("duration_seconds")),
        "comparison_mode": _safe_mode(payload.get("comparison_mode")),
        "batch_size": _safe_nonnegative_integer(payload.get("batch_size")),
        "comparison_options": _safe_options(payload.get("comparison_options")),
        "totals": _totals(safe_tables),
        "tables": safe_tables,
    }
    _write_json(run_dir / _REPORT_KINDS["summary"], summary)
    _write_csv(run_dir / _REPORT_KINDS["csv"], safe_tables)
    _write_log(run_dir / _REPORT_KINDS["log"], log_entries)
    _write_json(
        run_dir / "manifest.json",
        {
            "format_version": 1,
            "run_id": run_id,
            "status": status,
            "started_at": summary["started_at"],
            "completed_at": completed_at,
            "mode": summary["comparison_mode"],
            "selected_tables": [item["table_id"] for item in safe_tables],
        },
    )
    return {
        "run_id": run_id,
        "status": status,
        "files": {
            kind: f"/api/reports/{run_id}/{kind}"
            for kind in _REPORT_KINDS
        }
        | {"dashboard": f"/reports/{run_id}/dashboard"},
    }


def report_file(reports_root: Path, run_id: str, kind: str) -> Path:
    if kind not in _REPORT_KINDS:
        raise DatabaseConfigurationError("Choose a supported report export.")
    path = report_run_directory(reports_root, run_id) / _REPORT_KINDS[kind]
    if not path.is_file():
        raise DatabaseConfigurationError("That report export is not available yet.")
    return path


def report_summary(reports_root: Path, run_id: str) -> dict[str, Any]:
    path = report_run_directory(reports_root, run_id) / _REPORT_KINDS["summary"]
    if not path.is_file():
        raise DatabaseConfigurationError(
            "The comparison dashboard is available after report export completes."
        )
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatabaseConfigurationError("The report summary could not be read.") from exc
    if not isinstance(value, dict) or value.get("run_id") != run_id:
        raise DatabaseConfigurationError("The report summary is invalid.")
    return value


def dashboard_mismatch_page(
    reports_root: Path,
    run_id: str,
    *,
    page: int,
    page_size: int,
    table_id: str = "",
    kind: str = "",
    search: str = "",
) -> dict[str, Any]:
    """Read a bounded, filterable page from the complete streaming JSONL report."""
    if page < 1 or page_size not in {25, 50, 100, 250, 1000}:
        raise DatabaseConfigurationError("Choose a supported report page size.")
    supported_kinds = {"", "different", "sql_only", "postgres_only"}
    if kind not in supported_kinds:
        raise DatabaseConfigurationError("Choose a supported mismatch type.")

    path = report_file(reports_root, run_id, "mismatches")
    wanted_table = table_id.casefold().strip()
    wanted_search = search.casefold().strip()[:200]
    start = (page - 1) * page_size
    rows: list[dict[str, Any]] = []
    total = 0
    all_total = 0
    kind_counts: Counter[str] = Counter()
    table_counts: Counter[str] = Counter()

    try:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(item, dict):
                    continue
                item_table = _safe_text(item.get("table_id"), 256)
                item_kind = _safe_text(item.get("kind"), 40)
                all_total += 1
                kind_counts[item_kind] += 1
                table_counts[item_table] += 1
                if wanted_table and item_table.casefold() != wanted_table:
                    continue
                if kind and item_kind != kind:
                    continue
                if wanted_search and wanted_search not in json.dumps(
                    item, ensure_ascii=False, default=str
                ).casefold():
                    continue
                if start <= total < start + page_size:
                    rows.append(item)
                total += 1
    except OSError as exc:
        raise DatabaseConfigurationError("The mismatch report could not be read.") from exc

    return {
        "run_id": run_id,
        "rows": rows,
        "pagination": {
            "page": min(page, max(1, (total + page_size - 1) // page_size)),
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        },
        "facets": {
            "total": all_total,
            "kinds": dict(kind_counts),
            "tables": [
                {"table_id": name, "count": count}
                for name, count in sorted(table_counts.items(), key=lambda value: value[0].casefold())
            ],
        },
    }


def report_run_directory(reports_root: Path, run_id: str) -> Path:
    if not _RUN_ID_PATTERN.fullmatch(str(run_id)):
        raise DatabaseConfigurationError("The report run identifier is invalid.")
    root = reports_root.resolve()
    run_dir = (root / run_id).resolve()
    if run_dir.parent != root or not run_dir.is_dir():
        raise DatabaseConfigurationError("The report run is unavailable.")
    return run_dir


def _safe_table_summary(item: dict[str, Any]) -> dict[str, Any]:
    row_counts = item.get("row_counts") if isinstance(item.get("row_counts"), dict) else {}
    data_counts = item.get("data_counts") if isinstance(item.get("data_counts"), dict) else {}
    key = item.get("comparison_key") if isinstance(item.get("comparison_key"), list) else []
    return {
        "table_id": _safe_text(item.get("table_id"), 256),
        "sqlserver_table": _safe_text(item.get("sqlserver_table"), 256),
        "postgres_table": _safe_text(item.get("postgres_table"), 256),
        "status": _safe_text(item.get("status"), 40),
        "summary": _safe_text(item.get("summary"), 1_000),
        "sqlserver_columns": _safe_nonnegative_integer(item.get("sqlserver_columns")),
        "postgres_columns": _safe_nonnegative_integer(item.get("postgres_columns")),
        "column_differences": _safe_nonnegative_integer(item.get("column_differences")),
        "sqlserver_rows": _safe_optional_integer(row_counts.get("sqlserver")),
        "postgres_rows": _safe_optional_integer(row_counts.get("postgres")),
        "row_count_difference": _safe_optional_integer(row_counts.get("difference")),
        "comparison_key": [_safe_text(value, 256) for value in key[:20]],
        "matched_rows": _safe_nonnegative_integer(data_counts.get("matched")),
        "value_mismatches": _safe_nonnegative_integer(data_counts.get("different")),
        "sqlserver_only_rows": _safe_nonnegative_integer(data_counts.get("sql_only")),
        "postgres_only_rows": _safe_nonnegative_integer(data_counts.get("postgres_only")),
        "processed_rows": _safe_nonnegative_integer(item.get("processed_rows")),
        "data_skipped": _safe_text(item.get("data_skipped"), 1_000),
        "schema_differences": _safe_schema_differences(item.get("schema_differences")),
        "primary_key_status": _safe_text(item.get("primary_key_status"), 40),
        "sqlserver_primary_key": _safe_string_list(item.get("sqlserver_primary_key")),
        "postgres_primary_key": _safe_string_list(item.get("postgres_primary_key")),
    }


def _safe_string_list(value: Any, limit: int = 20) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_safe_text(item, 256) for item in value[:limit]]


def _safe_schema_differences(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value[:1_000]:
        if not isinstance(item, dict):
            continue
        result.append(
            {
                "column": _safe_text(item.get("column"), 256),
                "status": _safe_text(item.get("status"), 40),
                "sqlserver": _safe_text(item.get("sqlserver"), 256),
                "postgres": _safe_text(item.get("postgres"), 256),
                "expected_postgres": _safe_text(item.get("expected_postgres"), 256),
                "reason": _safe_text(item.get("reason"), 1_000),
            }
        )
    return result


def _totals(tables: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "tables": len(tables),
        "matches": sum(item["status"] == "match" for item in tables),
        "differences": sum(item["status"] in {"different", "missing_table"} for item in tables),
        "errors": sum(item["status"] == "error" for item in tables),
        "cancelled": sum(item["status"] == "cancelled" for item in tables),
        "row_mismatches": sum(
            item["value_mismatches"]
            + item["sqlserver_only_rows"]
            + item["postgres_only_rows"]
            for item in tables
        ),
    }


def _write_json(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        temporary.write_text(
            json.dumps(value, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(path)
    except OSError as exc:
        raise DatabaseConfigurationError(
            "The local report could not be saved. Check folder permissions and free space."
        ) from exc


def _write_csv(path: Path, tables: list[dict[str, Any]]) -> None:
    fields = [
        "table_id",
        "sqlserver_table",
        "postgres_table",
        "status",
        "sqlserver_columns",
        "postgres_columns",
        "column_differences",
        "sqlserver_rows",
        "postgres_rows",
        "row_count_difference",
        "comparison_key",
        "matched_rows",
        "value_mismatches",
        "sqlserver_only_rows",
        "postgres_only_rows",
        "processed_rows",
        "data_skipped",
        "summary",
    ]
    try:
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for item in tables:
                row = dict(item)
                row["comparison_key"] = ", ".join(item["comparison_key"])
                writer.writerow(
                    {
                        field: _safe_csv_cell(row.get(field, ""))
                        for field in fields
                    }
                )
    except OSError as exc:
        raise DatabaseConfigurationError(
            "The CSV report could not be saved. Check the reports folder."
        ) from exc


def _safe_csv_cell(value: Any) -> Any:
    """Prevent spreadsheet applications from evaluating exported text as a formula."""
    if not isinstance(value, str):
        return value
    stripped = value.lstrip()
    if stripped.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value


def _write_log(path: Path, entries: list[Any]) -> None:
    safe_lines = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        timestamp = _safe_text(entry.get("timestamp"), 40)
        level = _safe_text(entry.get("level"), 12)
        message = _safe_text(entry.get("message"), 2_000).replace("\r", " ").replace("\n", " ")
        safe_lines.append(f"{timestamp}\t{level}\t{message}".rstrip())
    try:
        path.write_text("\n".join(safe_lines) + ("\n" if safe_lines else ""), encoding="utf-8")
    except OSError as exc:
        raise DatabaseConfigurationError(
            "The execution log could not be saved. Check the reports folder."
        ) from exc


def _safe_mode(value: Any) -> str:
    mode = str(value or "full")
    return mode if mode in {"full", "schema_and_counts", "schema_only"} else "full"


def _safe_options(value: Any) -> dict[str, Any]:
    options = value if isinstance(value, dict) else {}
    return {
        "ignore_trailing_spaces": bool(options.get("ignore_trailing_spaces")),
        "case_sensitive": bool(options.get("case_sensitive", True)),
        "decimal_tolerance": _safe_text(options.get("decimal_tolerance"), 40),
        "timestamp_tolerance_ms": _safe_text(options.get("timestamp_tolerance_ms"), 40),
    }


def _safe_table_ids(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_safe_text(item, 256) for item in value[:10_000]]


def _safe_text(value: Any, limit: int) -> str:
    return str(value or "")[:limit]


def _safe_nonnegative_integer(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _safe_optional_integer(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_nonnegative_number(value: Any) -> float:
    try:
        return max(0.0, round(float(value or 0), 3))
    except (TypeError, ValueError):
        return 0.0
