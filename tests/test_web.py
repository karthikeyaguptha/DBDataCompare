import time
from pathlib import Path
from unittest.mock import patch

from db_compare import create_app
from db_compare.db import DatabaseConnectionError


def client():
    app = create_app({"TESTING": True})
    return app.test_client()


def test_home_page_loads():
    response = client().get("/")

    assert response.status_code == 200
    assert b"Data Sync Check" in response.data
    assert b"Two sources. One truth." in response.data
    assert b"data-sync-check-wordmark-light.png" in response.data
    assert b"data-sync-check-wordmark-dark.png" in response.data
    assert b"dsc-lettermark-light.png" in response.data
    assert b"dsc-lettermark-dark.png" in response.data
    assert response.data.index(b"dsc-lettermark-light.png") < response.data.index(
        b"data-sync-check-wordmark-light.png"
    )
    assert response.data.index(b"dsc-lettermark-dark.png") < response.data.index(
        b"data-sync-check-wordmark-dark.png"
    )
    assert b'<option value="full" selected>Schema + Row Count + Data</option>' in response.data
    assert b"Rows SQL / PG" in response.data
    assert b'<option value="credentials" selected>SQL Server Authentication</option>' in response.data
    assert b'id="tablePagination"' in response.data
    assert b'id="tablesBody"' in response.data
    assert b'value="available" checked disabled' in response.data
    assert b"Only in SQL Server" in response.data
    assert b"Only in PostgreSQL" in response.data
    assert b'id="profileSelect"' in response.data
    assert b'id="exportReport"' in response.data
    assert b'id="clearTableSearch"' in response.data
    assert b'id="selectAllTables"' in response.data
    assert b'<option value="mismatches" selected>Data Mismatch Report</option>' in response.data
    assert b'id="themeToggle"' in response.data
    assert b'id="backToTop"' in response.data
    assert b'id="stopCompare"' in response.data
    assert b'id="stopNow"' in response.data
    assert b"v1.6.0" in response.data
    assert b'id="notificationStack"' in response.data
    assert b'<details class="table-filter-options">' in response.data
    assert b"<summary>More options</summary>" in response.data
    assert b'id="openDashboard"' in response.data
    assert b"microsoftsqlserver-original.svg" in response.data
    assert b"postgresql-original.svg" in response.data
    assert b"connection-options-row" in response.data
    assert b'id="serviceBanner"' in response.data
    assert b'data-accordion-step="1"' in response.data
    assert b'data-accordion-step="2"' in response.data
    assert b'data-accordion-step="3"' in response.data
    assert b'id="firstTablePage"' in response.data
    assert b'id="lastTablePage"' in response.data
    assert b'id="tablePageInput"' in response.data
    assert b'id="goTablePage"' not in response.data
    assert b'id="sqlPortHelp"' in response.data
    assert b'id="copySqlPortQuery"' in response.data
    assert b'id="comparisonVolume"' in response.data
    assert b"Local session" not in response.data


def test_health_endpoint_reports_workflow_results_checkpoint():
    response = client().get("/api/health")

    assert response.status_code == 200
    assert response.json["status"] == "ready"
    assert response.json["application"] == "Data Sync Check"
    assert response.json["phase"] == "v1.6.0-report-readability-and-documentation"


def test_dashboard_assets_and_active_run_handoff_are_present():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "dashboard.html").read_text(
        encoding="utf-8"
    )
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )
    dashboard_js = (project_root / "static" / "js" / "dashboard.js").read_text(
        encoding="utf-8"
    )
    dashboard_css = (project_root / "static" / "css" / "dashboard.css").read_text(
        encoding="utf-8"
    )

    assert "Data Sync Check Comparison Report" in template
    assert 'class="report-title-logo"' in template
    assert 'class="report-title-wordmark"' in template
    assert "data-sync-check-wordmark-light.png" in template
    assert "data-sync-check-wordmark-dark.png" in template
    assert '<span class="sr-only">Data Sync Check</span>' in template
    assert template.index("dsc-lettermark-light.png") < template.index(
        "data-sync-check-wordmark-light.png"
    )
    assert template.index("dsc-lettermark-dark.png") < template.index(
        "data-sync-check-wordmark-dark.png"
    )
    assert "<h1>Comparison Report</h1>" in template
    assert "<header" not in template
    assert "report-header" not in template
    assert "report-brand" not in template
    assert 'id="exportPdf"' in template
    assert 'id="reportThemeToggle"' in template
    assert "Back to workspace" not in template
    assert "SQL Server · Source" in template
    assert "Schema + Row Count + Data" in template
    assert 'class="completed-meta"' in template
    assert "summary.duration_seconds|duration" in template
    assert "print-chrome" not in template
    assert "print-page-header" not in template
    assert "print-page-footer" not in template
    assert "Generated by Data Sync Check" not in template
    assert 'id="tableFilter"' in template
    assert "requestSafeStop" in javascript
    assert "await state.comparisonPromise" in javascript
    assert "window.print()" in dashboard_js
    assert "applyTheme" in dashboard_js
    assert "@media print" in dashboard_css
    assert ':root[data-theme="dark"]' in dashboard_css
    assert 'content: "Page " counter(page) " / " counter(pages);' in dashboard_css
    assert "margin: 14mm 10mm 13mm;" in dashboard_css
    assert "break-before: page;" in dashboard_css
    assert "thead { display: table-header-group; }" in dashboard_css
    assert ".report-title-logo" in dashboard_css
    assert "width: 78px" in dashboard_css
    assert "height: 43px" in dashboard_css
    assert ".run-meta dd" in dashboard_css
    assert "overflow-wrap: anywhere" in dashboard_css
    assert "text-overflow: ellipsis" not in dashboard_css.split(
        ".run-meta dd", 1
    )[1].split(".run-meta .completed-meta", 1)[0]


def test_secondary_table_filters_are_grouped_under_more_options():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "index.html").read_text(
        encoding="utf-8"
    )

    options_start = template.index('<details class="table-filter-options">')
    options_end = template.index("</details>", options_start)
    common_position = template.index('value="available"')
    sql_only_position = template.index('value="sql_only"')
    postgres_only_position = template.index('value="postgres_only"')

    assert common_position < options_start
    assert options_start < sql_only_position < options_end
    assert options_start < postgres_only_position < options_end


def test_step_two_more_options_uses_connection_card_plus_minus_indicator():
    project_root = Path(__file__).resolve().parents[1]
    stylesheet = (project_root / "static" / "css" / "styles.css").read_text(
        encoding="utf-8"
    )

    table_options = stylesheet[
        stylesheet.index(".table-filter-options summary::after"):
        stylesheet.index(".table-filter-options-menu")
    ]
    assert 'content: "+";' in table_options
    assert 'content: "−";' in table_options
    assert 'content: "⌄";' not in table_options
    assert "rotate(" not in table_options


def test_start_comparison_action_is_available_in_steps_two_and_three():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "index.html").read_text(
        encoding="utf-8"
    )

    step_three = template.index('id="compareSection"')
    assert template.count("data-start-comparison") == 2
    assert template.index('id="startCompareStep2"') < step_three
    assert template.index('id="startCompareStep3"') > step_three


def test_dark_theme_is_the_default_across_workspace_and_report():
    project_root = Path(__file__).resolve().parents[1]
    index_template = (project_root / "templates" / "index.html").read_text(
        encoding="utf-8"
    )
    dashboard_template = (project_root / "templates" / "dashboard.html").read_text(
        encoding="utf-8"
    )
    app_javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )
    dashboard_javascript = (
        project_root / "static" / "js" / "dashboard.js"
    ).read_text(encoding="utf-8")

    assert '<html lang="en" data-theme="dark">' in index_template
    assert '<html lang="en" data-theme="dark">' in dashboard_template
    assert 'document.documentElement.dataset.theme = saved || "dark";' in index_template
    assert '(saved || "dark")' in dashboard_template
    assert 'dataset.theme || "dark"' in app_javascript
    assert 'dataset.theme || "dark"' in dashboard_javascript


def test_locked_table_overlay_has_theme_safe_contrast_tokens():
    project_root = Path(__file__).resolve().parents[1]
    stylesheet = (project_root / "static" / "css" / "styles.css").read_text(
        encoding="utf-8"
    )

    assert "--locked-surface: rgba(248, 249, 251, 0.94);" in stylesheet
    assert "--locked-surface: rgba(29, 34, 46, 0.96);" in stylesheet
    assert "background: var(--locked-surface);" in stylesheet
    assert "color: var(--locked-ink);" in stylesheet
    assert "color: var(--locked-ink-soft);" in stylesheet
    assert "background: var(--locked-mark-bg);" in stylesheet


def test_database_icons_are_bundled_static_assets():
    test_client = client()
    sql_icon = test_client.get("/static/img/microsoftsqlserver-original.svg")
    pg_icon = test_client.get("/static/img/postgresql-original.svg")

    assert sql_icon.status_code == 200
    assert pg_icon.status_code == 200
    assert sql_icon.mimetype == "image/svg+xml"
    assert pg_icon.mimetype == "image/svg+xml"


def test_connection_feedback_has_persistent_success_treatment():
    project_root = Path(__file__).resolve().parents[1]
    javascript = (project_root / "static" / "js" / "app.js").read_text(encoding="utf-8")
    stylesheet = (project_root / "static" / "css" / "styles.css").read_text(encoding="utf-8")

    assert "SQL Server connection verified successfully." in javascript
    assert "PostgreSQL connection verified successfully." in javascript
    assert 'feedback.className = `form-feedback ${kind}`' in javascript
    assert ".form-feedback.success::before" in stylesheet


def test_result_status_ui_describes_each_matching_layer():
    project_root = Path(__file__).resolve().parents[1]
    with (project_root / "static" / "js" / "app.js").open(encoding="utf-8") as handle:
        source = handle.read()

    assert '{ name: "Schema", ran: true' in source
    assert 'name: "count"' in source
    assert 'name: "data"' in source
    assert "matchedResultLabel(result)" in source
    assert 'complete ? "ready" : "warning"' in source


def test_result_ui_renders_three_independent_vertical_badges():
    project_root = Path(__file__).resolve().parents[1]
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )
    stylesheet = (project_root / "static" / "css" / "styles.css").read_text(
        encoding="utf-8"
    )

    assert "function resultCheckBadges(result)" in javascript
    assert '["Schema match", "ready"]' in javascript
    assert '["Count match", "ready"]' in javascript
    assert '["Data match", "ready"]' in javascript
    assert '["Count not run", "warning"]' in javascript
    assert '["Data not run", "warning"]' in javascript
    assert 'statusStack.className = "result-status-stack"' in javascript
    assert "flex-direction: column;" in stylesheet
    assert ".result-check-badge" in stylesheet


def test_workflow_accordions_and_fixed_table_viewport_are_present():
    project_root = Path(__file__).resolve().parents[1]
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )
    stylesheet = (project_root / "static" / "css" / "styles.css").read_text(
        encoding="utf-8"
    )

    assert "function setAccordion(step, expanded" in javascript
    assert "openWorkflowStep(2, { collapseEarlier: true, scroll })" in javascript
    assert "openWorkflowStep(3, { collapseEarlier: true, scroll: true })" in javascript
    assert "height: clamp(420px, 56vh, 610px);" in stylesheet
    assert ".workflow-step.is-collapsed .step-content" in stylesheet
    assert "position: sticky;" in stylesheet


def test_service_status_is_compact_and_refreshable_from_header():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "index.html").read_text(
        encoding="utf-8"
    )
    stylesheet = (project_root / "static" / "css" / "styles.css").read_text(
        encoding="utf-8"
    )
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )

    assert 'class="service-indicator checking"' in template
    assert 'class="service-refresh"' in template
    assert ".service-indicator.offline" in stylesheet
    assert ".service-refresh.is-checking svg" in stylesheet
    assert 'showServiceBanner("ready", "Local service", "Running")' in javascript
    assert "checkBackendHealth();" in javascript


def test_profile_actions_and_accordion_headers_use_aligned_controls():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "index.html").read_text(
        encoding="utf-8"
    )
    stylesheet = (project_root / "static" / "css" / "styles.css").read_text(
        encoding="utf-8"
    )

    assert template.count('class="section-heading-actions"') == 3
    assert 'id="loadProfile"' not in template
    assert 'class="profile-choice"' in template
    assert 'class="icon-button save-profile"' in template
    assert 'class="icon-button delete-profile"' in template
    assert 'viewBox="0 0 24 24" aria-hidden="true"' in template
    assert ".section-heading-actions" in stylesheet
    assert "height: 40px;" in stylesheet
    assert ".delete-profile svg" in stylesheet


def test_connection_cards_hide_defaults_under_more_options():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "index.html").read_text(
        encoding="utf-8"
    )

    assert template.count('class="connection-more-options"') == 2
    connection_options = template.split('class="connection-more-options"')[1:]
    assert all(
        option.lstrip().startswith(">\n                            <summary>More options</summary>")
        for option in connection_options
    )
    assert template.index('id="sqlAuthentication"') > template.index(
        "<summary>More options</summary>"
    )
    assert "Test SQL Connection" in template
    assert "Test PGSQL Connection" in template
    assert template.count('class="test-tube-icon"') == 2


def test_accordion_controls_are_text_only_and_profiles_auto_load():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "index.html").read_text(
        encoding="utf-8"
    )
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )

    assert "accordion-chevron" not in template
    assert 'elements.profileSelect.addEventListener("change", () =>' in javascript
    assert "applyProfile(profile);" in javascript
    assert "resetProfileDefaults();" in javascript
    assert "elements.sqlForm.reset();" in javascript
    assert 'showToast("Default settings restored.");' in javascript
    assert 'existing?.name || window.prompt("Profile name", "")' in javascript


def test_pagination_supports_first_last_and_direct_page_jump():
    project_root = Path(__file__).resolve().parents[1]
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )

    assert "function goToTablePage(page)" in javascript
    assert 'elements.firstTablePage.addEventListener("click"' in javascript
    assert 'elements.lastTablePage.addEventListener("click"' in javascript
    assert "goTablePage" not in javascript
    assert 'event.key !== "Enter"' in javascript


def test_selection_pagination_accordion_and_port_hint_polish():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "index.html").read_text(
        encoding="utf-8"
    )
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )
    stylesheet = (project_root / "static" / "css" / "styles.css").read_text(
        encoding="utf-8"
    )

    selection_actions = template.index('class="selection-actions"')
    selected_badge = template.index('id="selectionCount"')
    clear_button = template.index('id="clearSelection"')
    assert selection_actions < selected_badge < clear_button
    assert template.count('class="page-button"') == 4
    assert 'id="goTablePage"' not in template
    assert "accordionHeadings" in javascript
    assert 'heading.addEventListener("click"' in javascript
    assert "SELECT DISTINCT local_tcp_port" in template
    assert "navigator.clipboard.writeText(elements.sqlPortQuery.textContent.trim())" in javascript
    assert ".page-button svg" in stylesheet
    assert ".selection-actions" in stylesheet
    assert ".port-help-panel" in stylesheet
    assert "cache: \"no-store\"" in javascript


def test_backend_offline_state_invalidates_stale_connections():
    project_root = Path(__file__).resolve().parents[1]
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )

    assert "function markBackendOffline()" in javascript
    assert "state.sqlValidated = false;" in javascript
    assert "state.pgValidated = false;" in javascript
    assert 'badge.textContent = "Service offline";' in javascript
    assert "Start run.bat" in javascript
    assert "window.setInterval" in javascript
    assert "checkBackendHealth" in javascript


def test_comparison_volume_tracks_discovered_and_processed_rows():
    project_root = Path(__file__).resolve().parents[1]
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )

    assert "function updateComparisonVolume()" in javascript
    assert "state.discoveredRowPositions += Math.max(" in javascript
    assert "state.currentTableProcessedRows = Number(response.processed || 0);" in javascript
    assert "state.runProcessedRows + state.currentTableProcessedRows" in javascript


def test_toast_has_theme_safe_contrast_tokens():
    project_root = Path(__file__).resolve().parents[1]
    with (project_root / "static" / "css" / "styles.css").open(
        encoding="utf-8"
    ) as handle:
        source = handle.read()

    assert source.count("--toast-bg:") == 2
    assert source.count("--toast-ink:") == 2
    assert "background: var(--toast-bg);" in source
    assert "color: var(--toast-ink);" in source


def test_notifications_use_top_right_stack_five_second_countdown_and_close():
    project_root = Path(__file__).resolve().parents[1]
    template = (project_root / "templates" / "index.html").read_text(encoding="utf-8")
    dashboard_template = (project_root / "templates" / "dashboard.html").read_text(
        encoding="utf-8"
    )
    javascript = (project_root / "static" / "js" / "app.js").read_text(
        encoding="utf-8"
    )
    dashboard_javascript = (
        project_root / "static" / "js" / "dashboard.js"
    ).read_text(encoding="utf-8")
    css = (project_root / "static" / "css" / "styles.css").read_text(
        encoding="utf-8"
    )
    dashboard_css = (
        project_root / "static" / "css" / "dashboard.css"
    ).read_text(encoding="utf-8")

    assert 'id="notificationStack"' in template
    assert 'id="notificationStack"' in dashboard_template
    for source in (javascript, dashboard_javascript):
        assert "const NOTIFICATION_DURATION_MS = 5000;" in source
        assert 'closeButton.setAttribute("aria-label", "Dismiss notification");' in source
        assert "notification-progress" in source
        assert "notification-brand" not in source
        assert "dsc-lettermark-light.png" not in source
        assert "dsc-lettermark-dark.png" not in source
        assert "notification.addEventListener" not in source
    for source in (css, dashboard_css):
        assert ".notification-stack" in source
        assert "@keyframes notification-countdown" in source
        assert ".notification-success" in source
        assert ".notification-warning" in source
        assert ".notification-error" in source
        assert ".notification-brand" not in source


def test_cancel_unknown_operation_is_safe():
    response = client().post("/api/operations/not-active/cancel-now", json={})

    assert response.status_code == 200
    assert response.json["status"] == "not_active"


@patch("db_compare.web.test_database_connection")
def test_connection_endpoint_routes_valid_request(mock_test):
    response = client().post(
        "/api/connections/test",
        json={
            "database_type": "sqlserver",
            "connection": {"server": "db-host", "database": "source"},
        },
    )

    assert response.status_code == 200
    assert response.json["status"] == "connected"
    mock_test.assert_called_once()


@patch(
    "db_compare.web.test_database_connection",
    side_effect=DatabaseConnectionError("SQL Server rejected the login."),
)
def test_connection_endpoint_returns_safe_driver_error(_mock_test):
    response = client().post(
        "/api/connections/test",
        json={
            "database_type": "sqlserver",
            "connection": {"username": "user", "password": "secret-value"},
        },
    )

    assert response.status_code == 503
    assert response.json["message"] == "SQL Server rejected the login."
    assert "secret-value" not in response.get_data(as_text=True)


@patch("db_compare.web.load_table_names")
def test_tables_endpoint_merges_searches_and_paginates(mock_load):
    mock_load.return_value = (
        ["Audit", "Customers", "Orders", "Products"],
        ["customers", "Invoices", "orders", "Products"],
    )

    response = client().post(
        "/api/tables",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "search": "o",
            "statuses": ["available", "sql_only", "postgres_only"],
            "page": 1,
            "page_size": 5,
        },
    )

    assert response.status_code == 200
    assert response.json["pagination"] == {
        "page": 1,
        "page_size": 5,
        "total": 4,
        "total_pages": 1,
    }
    assert [row["id"] for row in response.json["tables"]] == [
        "customers",
        "invoices",
        "orders",
        "products",
    ]
    assert response.json["tables"][0]["status"] == "available"
    assert response.json["tables"][1]["status"] == "postgres_only"
    assert len(response.json["matching_ids"]) == 4
    assert response.json["catalog_token"]


@patch("db_compare.web.load_table_names")
def test_tables_endpoint_defaults_to_common_tables(mock_load):
    mock_load.return_value = (
        ["Audit", "Customers", "Orders"],
        ["customers", "Invoices", "orders"],
    )

    response = client().post(
        "/api/tables",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "page": 1,
            "page_size": 10,
        },
    )

    assert response.status_code == 200
    assert [row["id"] for row in response.json["tables"]] == ["customers", "orders"]
    assert {row["status"] for row in response.json["tables"]} == {"available"}


@patch("db_compare.web.load_table_names")
def test_cached_catalog_search_and_filter_do_not_reload_databases(mock_load):
    mock_load.return_value = (
        ["Audit", "Customers", "Orders"],
        ["customers", "Invoices", "orders"],
    )
    test_client = client()
    initial = test_client.post(
        "/api/tables",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "statuses": ["available"],
            "page": 1,
            "page_size": 10,
        },
    )

    filtered = test_client.post(
        "/api/tables",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "catalog_token": initial.json["catalog_token"],
            "search": "inv",
            "statuses": ["postgres_only"],
            "page": 1,
            "page_size": 10,
        },
    )

    assert filtered.status_code == 200
    assert [row["id"] for row in filtered.json["tables"]] == ["invoices"]
    assert filtered.json["catalog_token"] == initial.json["catalog_token"]
    mock_load.assert_called_once()


def test_tables_endpoint_rejects_unsupported_page_size():
    response = client().post(
        "/api/tables",
        json={
            "sqlserver": {},
            "postgres": {},
            "page": 1,
            "page_size": 999,
        },
    )

    assert response.status_code == 400
    assert response.json["status"] == "error"


@patch("db_compare.web.compare_table_schema")
@patch("db_compare.web.load_table_names")
def test_schema_endpoint_uses_catalog_mapping(mock_load, mock_compare):
    mock_load.return_value = (["Customer"], ["customer"])
    mock_compare.return_value = {
        "status": "match",
        "summary": "Column metadata matches.",
    }
    test_client = client()
    catalog = test_client.post(
        "/api/tables",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "page": 1,
            "page_size": 10,
        },
    )

    response = test_client.post(
        "/api/schema/compare",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "catalog_token": catalog.json["catalog_token"],
            "table_id": "customer",
        },
    )

    assert response.status_code == 200
    assert response.json["result"]["status"] == "match"
    mock_compare.assert_called_once_with(
        {"server": "source"},
        {"host": "target"},
        "Customer",
        "customer",
    )


def test_schema_endpoint_rejects_expired_catalog():
    response = client().post(
        "/api/schema/compare",
        json={
            "sqlserver": {},
            "postgres": {},
            "catalog_token": "expired-token",
            "table_id": "customer",
        },
    )

    assert response.status_code == 400
    assert "expired" in response.json["message"]


@patch("db_compare.web.compare_table_row_counts")
@patch("db_compare.web.load_table_names")
def test_count_endpoint_uses_catalog_mapping(mock_load, mock_compare):
    mock_load.return_value = (["Customer"], ["customer"])
    mock_compare.return_value = {
        "status": "different",
        "summary": "2 row difference found.",
        "sqlserver": 102,
        "postgres": 100,
        "difference": 2,
    }
    test_client = client()
    catalog = test_client.post(
        "/api/tables",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "page": 1,
            "page_size": 10,
        },
    )

    response = test_client.post(
        "/api/counts/compare",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "catalog_token": catalog.json["catalog_token"],
            "table_id": "customer",
        },
    )

    assert response.status_code == 200
    assert response.json["result"]["difference"] == 2
    mock_compare.assert_called_once_with(
        {"server": "source"},
        {"host": "target"},
        "Customer",
        "customer",
    )


def test_count_endpoint_rejects_expired_catalog():
    response = client().post(
        "/api/counts/compare",
        json={
            "sqlserver": {},
            "postgres": {},
            "catalog_token": "expired-token",
            "table_id": "customer",
        },
    )

    assert response.status_code == 400
    assert "expired" in response.json["message"]


@patch("db_compare.web.compare_table_data")
@patch("db_compare.web.compare_table_schema")
@patch("db_compare.web.load_table_names")
def test_data_job_starts_and_returns_completed_result(
    mock_load, mock_schema, mock_data
):
    mock_load.return_value = (["Customer"], ["customer"])
    mock_schema.return_value = {
        "status": "match",
        "comparison_key": ["Id"],
        "columns": [],
    }
    mock_data.return_value = {
        "status": "match",
        "summary": "Row data matches.",
        "processed": 20,
        "counts": {
            "matched": 20,
            "different": 0,
            "sql_only": 0,
            "postgres_only": 0,
        },
        "mismatch_total": 0,
        "preview": [],
        "preview_limited": False,
    }
    test_client = client()
    catalog = test_client.post(
        "/api/tables",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "page": 1,
            "page_size": 10,
        },
    )

    started = test_client.post(
        "/api/data/compare/start",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "catalog_token": catalog.json["catalog_token"],
            "table_id": "customer",
            "batch_size": 5000,
            "comparison_key": [],
            "options": {},
        },
    )

    assert started.status_code == 202
    for _ in range(20):
        status = test_client.get(
            f'/api/data/compare/{started.json["job_id"]}'
        )
        if status.json["status"] == "complete":
            break
        time.sleep(0.01)
    assert status.json["status"] == "complete"
    assert status.json["result"]["processed"] == 20
    mock_data.assert_called_once()


@patch("db_compare.web.load_table_names")
def test_data_job_rejects_unsupported_batch_size(mock_load):
    mock_load.return_value = (["Customer"], ["customer"])
    test_client = client()
    catalog = test_client.post(
        "/api/tables",
        json={
            "sqlserver": {},
            "postgres": {},
            "page": 1,
            "page_size": 10,
        },
    )

    response = test_client.post(
        "/api/data/compare/start",
        json={
            "sqlserver": {},
            "postgres": {},
            "catalog_token": catalog.json["catalog_token"],
            "table_id": "customer",
            "batch_size": 123,
        },
    )

    assert response.status_code == 400
    assert "batch size" in response.json["message"].lower()
