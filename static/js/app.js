"use strict";

const state = {
    sqlValidated: false,
    pgValidated: false,
    sqlSignature: "",
    pgSignature: "",
    tablesLoaded: false,
    tablePage: 1,
    tablePageSize: 10,
    tableTotal: 0,
    tableTotalPages: 1,
    catalogToken: "",
    currentMatchingIds: [],
    selectedTables: new Set(),
    searchTimer: null,
    tableRequestController: null,
    tableRequestId: 0,
    schemaResults: new Map(),
    comparing: false,
    stopRequested: false,
    compareController: null,
    elapsedTimer: null,
    comparisonStartedAt: null,
};

const elements = {
    sqlForm: document.querySelector("#sqlForm"),
    pgForm: document.querySelector("#pgForm"),
    sqlAuthentication: document.querySelector("#sqlAuthentication"),
    sqlCredentials: document.querySelector("#sqlCredentials"),
    loadTablesButton: document.querySelector("#loadTablesButton"),
    tablesOverlay: document.querySelector("#tablesOverlay"),
    tablesBody: document.querySelector("#tablesBody"),
    tableSearch: document.querySelector("#tableSearch"),
    tableStatusFilters: [...document.querySelectorAll(".table-status-filter")],
    selectAllTables: document.querySelector("#selectAllTables"),
    clearSelection: document.querySelector("#clearSelection"),
    selectionCount: document.querySelector("#selectionCount"),
    tablePageSize: document.querySelector("#tablePageSize"),
    tablePageRange: document.querySelector("#tablePageRange"),
    tablePageStatus: document.querySelector("#tablePageStatus"),
    previousTablePage: document.querySelector("#previousTablePage"),
    nextTablePage: document.querySelector("#nextTablePage"),
    selectedSummary: document.querySelector("#selectedSummary"),
    estimatedWork: document.querySelector("#estimatedWork"),
    comparisonMode: document.querySelector("#comparisonMode"),
    batchSize: document.querySelector("#batchSize"),
    startCompare: document.querySelector("#startCompare"),
    stopCompare: document.querySelector("#stopCompare"),
    progressTitle: document.querySelector("#progressTitle"),
    progressStatus: document.querySelector("#progressStatus"),
    progressPercent: document.querySelector("#progressPercent"),
    progressBar: document.querySelector("#progressBar"),
    progressTrack: document.querySelector(".progress-track"),
    currentTable: document.querySelector("#currentTable"),
    completedTables: document.querySelector("#completedTables"),
    elapsedTime: document.querySelector("#elapsedTime"),
    resultsBody: document.querySelector("#schemaResultsBody"),
    resultsEmpty: document.querySelector("#resultsEmpty"),
    resultsTable: document.querySelector("#schemaResultsTable"),
    resultsCount: document.querySelector("#resultsCount"),
    resultsTab: document.querySelector("#resultsTab"),
    logTab: document.querySelector("#logTab"),
    resultsPanel: document.querySelector("#resultsPanel"),
    logPanel: document.querySelector("#logPanel"),
    logWindow: document.querySelector("#logWindow"),
    toast: document.querySelector("#toast"),
};

let toastTimer;

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3600);
}

function timestamp() {
    return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function addLog(level, message) {
    const row = document.createElement("div");
    const levelClass = level === "READY" ? "ok" : level === "WARN" ? "warn" : "info";
    row.innerHTML = `<time>${timestamp()}</time><span class="log-level ${levelClass}">${level}</span><span></span>`;
    row.lastElementChild.textContent = message;
    elements.logWindow.append(row);
    elements.logWindow.scrollTop = elements.logWindow.scrollHeight;
}

function showFeedback(prefix, message, kind = "error") {
    const feedback = document.querySelector(`#${prefix}Feedback`);
    const badge = document.querySelector(`#${prefix}State`);
    feedback.textContent = message;
    feedback.style.color = kind === "success" ? "var(--success)" : "var(--danger)";
    badge.textContent = kind === "success" ? "Connected" : "Connection failed";
    badge.className = `connection-state ${kind}`;
}

function formData(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll("input[type='checkbox']").forEach((input) => {
        data[input.name] = input.checked;
    });
    return data;
}

function safeSignature(config) {
    const copy = { ...config, password: config.password ? "__present__" : "" };
    return JSON.stringify(copy);
}

function connectionConfig(prefix) {
    return formData(prefix === "sql" ? elements.sqlForm : elements.pgForm);
}

function clearInvalid(form) {
    form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
}

function validateConnectionForm(form, prefix) {
    clearInvalid(form);
    const authUsesCredentials = prefix !== "sql" || elements.sqlAuthentication.value === "credentials";
    const requiredNames = prefix === "sql"
        ? ["server", "database", ...(authUsesCredentials ? ["username", "password"] : [])]
        : ["host", "database", "username", "password"];
    const missing = requiredNames
        .map((name) => form.elements[name])
        .filter((field) => !field.value.trim());

    if (!missing.length) return true;
    missing.forEach((field) => field.setAttribute("aria-invalid", "true"));
    missing[0].focus();
    showFeedback(prefix, `Complete ${missing.length} required field${missing.length > 1 ? "s" : ""}.`);
    addLog("WARN", `${prefix === "sql" ? "SQL Server" : "PostgreSQL"} form validation failed.`);
    return false;
}

async function requestJson(url, options) {
    const response = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({
        status: "error",
        message: "The local application returned an unreadable response.",
    }));
    if (!response.ok) throw new Error(payload.message || "The request failed.");
    return payload;
}

async function testConnection(form, prefix, databaseType) {
    if (!validateConnectionForm(form, prefix)) return;
    const button = form.querySelector(".test-button");
    const config = connectionConfig(prefix);
    button.disabled = true;
    button.classList.add("is-loading");
    button.lastChild.textContent = " Testing…";
    document.querySelector(`#${prefix}State`).textContent = "Testing";
    document.querySelector(`#${prefix}State`).className = "connection-state neutral";

    try {
        const result = await requestJson("/api/connections/test", {
            method: "POST",
            body: JSON.stringify({ database_type: databaseType, connection: config }),
        });
        state[`${prefix}Validated`] = true;
        state[`${prefix}Signature`] = safeSignature(config);
        showFeedback(prefix, result.message, "success");
        addLog("READY", result.message);
        updateConnectionState();
    } catch (error) {
        state[`${prefix}Validated`] = false;
        state[`${prefix}Signature`] = "";
        showFeedback(prefix, error.message);
        addLog("WARN", error.message);
        updateConnectionState();
    } finally {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.lastChild.textContent = prefix === "sql" ? " Test SQL Server" : " Test PostgreSQL";
    }
}

function updateConnectionState() {
    const bothValidated = state.sqlValidated && state.pgValidated;
    elements.loadTablesButton.disabled = !bothValidated;
    if (bothValidated) {
        document.querySelector("[data-step='1']").classList.add("complete");
        document.querySelector("[data-step='2']").classList.add("active");
        showToast("Both database connections succeeded. You can now load tables.");
    } else {
        document.querySelector("[data-step='1']").classList.remove("complete");
    }
}

function markFormChanged(prefix) {
    if (!state[`${prefix}Validated`]) return;
    const config = connectionConfig(prefix);
    if (safeSignature(config) === state[`${prefix}Signature`]) return;
    state[`${prefix}Validated`] = false;
    state[`${prefix}Signature`] = "";
    const feedback = document.querySelector(`#${prefix}Feedback`);
    const badge = document.querySelector(`#${prefix}State`);
    feedback.textContent = "Details changed. Test this connection again.";
    feedback.style.color = "var(--warning)";
    badge.textContent = "Changed";
    badge.className = "connection-state neutral";
    elements.loadTablesButton.disabled = true;
    lockTables();
    updateConnectionState();
}

function lockTables() {
    state.tableRequestController?.abort();
    state.tableRequestId += 1;
    state.tablesLoaded = false;
    state.catalogToken = "";
    state.currentMatchingIds = [];
    state.selectedTables.clear();
    state.schemaResults.clear();
    resetSchemaResults();
    elements.tablesOverlay.classList.remove("is-hidden");
    [elements.tableSearch, ...elements.tableStatusFilters, elements.selectAllTables, elements.clearSelection, elements.tablePageSize]
        .forEach((control) => { control.disabled = true; });
    elements.tablesBody.replaceChildren();
    updateSelectionCount();
}

function unlockTableWorkspace() {
    state.tablesLoaded = true;
    elements.tablesOverlay.classList.add("is-hidden");
    [elements.tableSearch, ...elements.tableStatusFilters, elements.selectAllTables, elements.clearSelection, elements.tablePageSize]
        .forEach((control) => { control.disabled = false; });
    elements.comparisonMode.disabled = false;
    elements.batchSize.disabled = true;
    document.querySelector("[data-step='2']").classList.add("complete");
    document.querySelector("[data-step='3']").classList.add("active");
}

function activeTableStatuses() {
    return elements.tableStatusFilters
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value);
}

async function loadTables({ resetPage = false, scroll = false, refreshCatalog = false } = {}) {
    if (!state.sqlValidated || !state.pgValidated) {
        showToast("Test both connections again before loading tables.");
        return;
    }
    if (refreshCatalog) {
        state.catalogToken = "";
        state.currentMatchingIds = [];
        state.selectedTables.clear();
    }
    if (resetPage) state.tablePage = 1;
    state.tableRequestController?.abort();
    state.tableRequestController = new AbortController();
    const requestId = ++state.tableRequestId;
    elements.loadTablesButton.disabled = true;
    elements.loadTablesButton.classList.add("is-loading");
    elements.loadTablesButton.textContent = "Loading tables…";

    try {
        const result = await requestJson("/api/tables", {
            method: "POST",
            body: JSON.stringify({
                sqlserver: connectionConfig("sql"),
                postgres: connectionConfig("pg"),
                catalog_token: state.catalogToken,
                search: elements.tableSearch.value,
                statuses: activeTableStatuses(),
                page: state.tablePage,
                page_size: state.tablePageSize,
            }),
            signal: state.tableRequestController.signal,
        });
        if (requestId !== state.tableRequestId) return;
        state.catalogToken = result.catalog_token;
        state.currentMatchingIds = result.matching_ids;
        state.tablePage = result.pagination.page;
        state.tableTotal = result.pagination.total;
        state.tableTotalPages = result.pagination.total_pages;
        renderTableRows(result.tables);
        unlockTableWorkspace();
        updatePagination();
        addLog("INFO", `Showing ${result.tables.length} of ${state.tableTotal} filtered table names.`);
        if (scroll) {
            document.querySelector("#tablesSection").scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } catch (error) {
        if (error.name === "AbortError") return;
        addLog("WARN", error.message);
        showToast(error.message);
    } finally {
        if (requestId !== state.tableRequestId) return;
        elements.loadTablesButton.disabled = !(state.sqlValidated && state.pgValidated);
        elements.loadTablesButton.classList.remove("is-loading");
        elements.loadTablesButton.innerHTML = 'Reload tables <span aria-hidden="true">→</span>';
    }
}

function renderTableRows(rows) {
    elements.tablesBody.replaceChildren();
    if (!rows.length) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML = '<td colspan="6" class="table-empty">No tables match this search.</td>';
        elements.tablesBody.append(emptyRow);
        updateSelectionCount();
        return;
    }

    rows.forEach((table) => {
        const row = document.createElement("tr");
        const sqlName = table.sqlserver || "Not found";
        const pgName = table.postgres || "Not found";
        const status = {
            available: ["Available in both", "ready"],
            sql_only: ["SQL Server only", "warning"],
            postgres_only: ["PostgreSQL only", "missing"],
        }[table.status];
        row.dataset.id = table.id;
        const priorResult = state.schemaResults.get(table.id);
        const columnSummary = priorResult
            ? `${priorResult.sqlserver_column_count ?? 0} / ${priorResult.postgres_column_count ?? 0}`
            : "Not compared";
        const keySummary = priorResult?.comparison_key?.join(", ")
            || (priorResult?.key_status === "different" ? "Keys differ" : "Not checked");
        row.innerHTML = `
            <td><input class="table-checkbox" type="checkbox"></td>
            <td><strong></strong><small></small></td>
            <td><strong></strong><small></small></td>
            <td><span class="column-summary"></span></td>
            <td><span class="key-summary"></span></td>
            <td><span class="status-chip ${status[1]}">${status[0]}</span></td>`;
        const checkbox = row.querySelector(".table-checkbox");
        checkbox.setAttribute("aria-label", `Select ${sqlName !== "Not found" ? sqlName : pgName} table`);
        checkbox.checked = state.selectedTables.has(table.id);
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                state.selectedTables.add(table.id);
            } else {
                state.selectedTables.delete(table.id);
            }
            updateSelectionCount();
        });
        const cells = row.querySelectorAll("td");
        cells[1].querySelector("strong").textContent = sqlName;
        cells[1].querySelector("small").textContent = table.sqlserver ? (elements.sqlForm.elements.schema.value || "dbo") : "";
        cells[2].querySelector("strong").textContent = pgName;
        cells[2].querySelector("small").textContent = table.postgres ? (elements.pgForm.elements.schema.value || "public") : "";
        if (!table.sqlserver) cells[1].querySelector("strong").classList.add("muted-value");
        if (!table.postgres) cells[2].querySelector("strong").classList.add("muted-value");
        cells[3].querySelector(".column-summary").textContent = columnSummary;
        cells[4].querySelector(".key-summary").textContent = keySummary;
        if (!priorResult) {
            cells[3].firstElementChild.classList.add("muted-value");
            cells[4].firstElementChild.classList.add("muted-value");
        }
        elements.tablesBody.append(row);
    });
    updateSelectionCount();
}

function currentCheckboxes() {
    return [...elements.tablesBody.querySelectorAll(".table-checkbox")];
}

function updateSelectionCount() {
    const selectedCount = state.selectedTables.size;
    const selectedMatchingCount = state.currentMatchingIds.reduce(
        (count, id) => count + Number(state.selectedTables.has(id)),
        0,
    );
    elements.selectionCount.textContent = `${selectedCount} selected`;
    elements.selectedSummary.textContent = String(selectedCount);
    updateEstimatedWork();
    elements.startCompare.disabled = selectedCount === 0 || state.comparing;
    elements.selectAllTables.checked = state.currentMatchingIds.length > 0
        && selectedMatchingCount === state.currentMatchingIds.length;
    elements.selectAllTables.indeterminate = selectedMatchingCount > 0
        && selectedMatchingCount < state.currentMatchingIds.length;
}

function updateEstimatedWork() {
    const selectedCount = state.selectedTables.size;
    const includeCounts = elements.comparisonMode.value === "schema_and_counts";
    elements.estimatedWork.textContent = selectedCount
        ? includeCounts
            ? `${selectedCount} schema + ${selectedCount} count check${selectedCount === 1 ? "" : "s"}`
            : `${selectedCount} schema check${selectedCount === 1 ? "" : "s"}`
        : "Waiting for tables";
}

function updatePagination() {
    const start = state.tableTotal ? (state.tablePage - 1) * state.tablePageSize + 1 : 0;
    const end = Math.min(state.tablePage * state.tablePageSize, state.tableTotal);
    elements.tablePageRange.textContent = `${start}${state.tableTotal ? `–${end}` : ""} of ${state.tableTotal} tables`;
    elements.tablePageStatus.textContent = `Page ${state.tablePage} of ${state.tableTotalPages}`;
    elements.previousTablePage.disabled = !state.tablesLoaded || state.tablePage === 1;
    elements.nextTablePage.disabled = !state.tablesLoaded || state.tablePage >= state.tableTotalPages;
}

function activateTab(name) {
    const showResults = name === "results";
    elements.resultsTab.classList.toggle("active", showResults);
    elements.resultsTab.setAttribute("aria-selected", String(showResults));
    elements.logTab.classList.toggle("active", !showResults);
    elements.logTab.setAttribute("aria-selected", String(!showResults));
    elements.resultsPanel.classList.toggle("is-hidden", !showResults);
    elements.logPanel.classList.toggle("is-hidden", showResults);
}

function resetSchemaResults() {
    elements.resultsBody?.replaceChildren();
    elements.resultsEmpty?.classList.remove("is-hidden");
    elements.resultsTable?.classList.add("is-hidden");
    if (elements.resultsCount) elements.resultsCount.textContent = "0";
}

function setProgress(completed, total, title, status) {
    const percent = total ? Math.round((completed / total) * 100) : 0;
    elements.progressTitle.textContent = title;
    elements.progressStatus.textContent = status;
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressBar.style.width = `${percent}%`;
    elements.progressTrack.setAttribute("aria-valuenow", String(percent));
    elements.completedTables.textContent = `${completed} / ${total}`;
}

function resultStatus(result) {
    const status = result.overall_status || result.status;
    if (status === "match") {
        return [result.row_counts ? "Full match" : "Schema match", "ready"];
    }
    if (status === "missing_table") return ["Table missing", "missing"];
    if (status === "error") return ["Error", "missing"];
    return ["Differences", "warning"];
}

function appendSchemaResult(tableId, result) {
    elements.resultsEmpty.classList.add("is-hidden");
    elements.resultsTable.classList.remove("is-hidden");
    const status = resultStatus(result);
    const row = document.createElement("tr");
    row.className = "schema-result-row";

    const tableCell = document.createElement("td");
    const tableName = document.createElement("strong");
    tableName.textContent = result.sqlserver_table || result.postgres_table || tableId;
    tableCell.append(tableName);

    const columnsCell = document.createElement("td");
    columnsCell.textContent = result.status === "error"
        ? "—"
        : `${result.sqlserver_column_count ?? 0} / ${result.postgres_column_count ?? 0}`;

    const differenceCell = document.createElement("td");
    differenceCell.textContent = result.status === "error"
        ? result.summary
        : String((result.counts?.different || 0) + (result.counts?.missing || 0));

    const rowCountsCell = document.createElement("td");
    rowCountsCell.textContent = result.row_counts
        ? `${formatCount(result.row_counts.sqlserver)} / ${formatCount(result.row_counts.postgres)}`
        : "Not run";
    if (!result.row_counts) rowCountsCell.classList.add("muted-value");

    const rowDifferenceCell = document.createElement("td");
    rowDifferenceCell.textContent = result.row_counts?.difference == null
        ? "—"
        : formatCount(result.row_counts.difference);
    if (result.row_counts?.status === "different") {
        rowDifferenceCell.classList.add("count-difference");
    }

    const keyCell = document.createElement("td");
    keyCell.textContent = result.comparison_key?.join(", ")
        || ({
            different: "Keys differ",
            required: "Key required",
            not_available: "Not available",
        }[result.key_status] || "Not found");

    const statusCell = document.createElement("td");
    const chip = document.createElement("span");
    chip.className = `status-chip ${status[1]}`;
    chip.textContent = status[0];
    statusCell.append(chip);

    const actionCell = document.createElement("td");
    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.className = "button ghost detail-button";
    detailButton.textContent = result.columns?.length ? "View columns" : "No details";
    detailButton.disabled = !result.columns?.length;
    actionCell.append(detailButton);
    row.append(
        tableCell,
        columnsCell,
        differenceCell,
        rowCountsCell,
        rowDifferenceCell,
        keyCell,
        statusCell,
        actionCell,
    );

    const detailRow = document.createElement("tr");
    detailRow.className = "schema-detail-row is-hidden";
    const detailCell = document.createElement("td");
    detailCell.colSpan = 8;
    detailCell.append(buildColumnDetails(result.columns || []));
    detailRow.append(detailCell);
    detailButton.addEventListener("click", () => {
        const opening = detailRow.classList.contains("is-hidden");
        detailRow.classList.toggle("is-hidden", !opening);
        detailButton.textContent = opening ? "Hide columns" : "View columns";
    });
    elements.resultsBody.append(row, detailRow);
    elements.resultsCount.textContent = String(state.schemaResults.size);
}

function buildColumnDetails(columns) {
    const wrap = document.createElement("div");
    wrap.className = "column-detail-wrap";
    const table = document.createElement("table");
    table.className = "column-detail-table";
    table.innerHTML = `
        <thead><tr><th>Column</th><th>SQL Server</th><th>PostgreSQL</th><th>Difference</th></tr></thead>
        <tbody></tbody>`;
    const body = table.querySelector("tbody");
    columns.forEach((column) => {
        const row = document.createElement("tr");
        const sql = column.sqlserver
            ? `${column.sqlserver.type} · ${column.sqlserver.nullable ? "NULL" : "NOT NULL"}`
            : "Missing";
        const pg = column.postgres
            ? `${column.postgres.type} · ${column.postgres.nullable ? "NULL" : "NOT NULL"}`
            : "Missing";
        [column.name, sql, pg, column.differences.join(", ") || "Match"].forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        });
        row.dataset.status = column.status;
        body.append(row);
    });
    wrap.append(table);
    return wrap;
}

function formatCount(value) {
    return value == null ? "—" : Number(value).toLocaleString("en-IN");
}

function combinedResult(schemaResult, countResult) {
    const overallStatus = schemaResult.status === "error"
        ? "error"
        : schemaResult.status === "missing_table"
            ? "missing_table"
            : schemaResult.status === "different" || countResult?.status === "different"
                ? "different"
                : "match";
    return {
        ...schemaResult,
        overall_status: overallStatus,
        row_counts: countResult || null,
    };
}

function updateElapsedTime() {
    if (!state.comparisonStartedAt) {
        elements.elapsedTime.textContent = "00:00";
        return;
    }
    const seconds = Math.max(
        0,
        Math.floor((Date.now() - state.comparisonStartedAt) / 1000),
    );
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    elements.elapsedTime.textContent =
        `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

async function runSchemaComparison() {
    if (state.comparing || !state.selectedTables.size) return;
    const tableIds = [...state.selectedTables];
    state.comparing = true;
    state.stopRequested = false;
    state.schemaResults.clear();
    resetSchemaResults();
    elements.startCompare.disabled = true;
    elements.stopCompare.disabled = false;
    elements.currentTable.textContent = "Preparing…";
    state.comparisonStartedAt = Date.now();
    window.clearInterval(state.elapsedTimer);
    updateElapsedTime();
    state.elapsedTimer = window.setInterval(updateElapsedTime, 1000);
    const includeCounts = elements.comparisonMode.value === "schema_and_counts";
    setProgress(
        0,
        tableIds.length,
        includeCounts ? "Comparing schemas and row counts" : "Comparing table schemas",
        includeCounts
            ? "Reading column metadata, keys, and exact row counts."
            : "Reading column metadata and keys.",
    );
    activateTab("results");
    addLog(
        "INFO",
        `${includeCounts ? "Schema and row-count" : "Schema"} comparison started for ${tableIds.length} table(s).`,
    );

    let completed = 0;
    for (const tableId of tableIds) {
        if (state.stopRequested) break;
        elements.currentTable.textContent = tableId;
        elements.progressStatus.textContent = `Comparing ${tableId}`;
        state.compareController = new AbortController();
        try {
            const schemaResponse = await requestJson("/api/schema/compare", {
                method: "POST",
                body: JSON.stringify({
                    sqlserver: connectionConfig("sql"),
                    postgres: connectionConfig("pg"),
                    catalog_token: state.catalogToken,
                    table_id: tableId,
                }),
                signal: state.compareController.signal,
            });
            let countResult = null;
            if (includeCounts && schemaResponse.result.status !== "error") {
                elements.progressStatus.textContent =
                    `Counting rows in ${tableId}. Exact counts can take longer for large tables.`;
                const countResponse = await requestJson("/api/counts/compare", {
                    method: "POST",
                    body: JSON.stringify({
                        sqlserver: connectionConfig("sql"),
                        postgres: connectionConfig("pg"),
                        catalog_token: state.catalogToken,
                        table_id: tableId,
                    }),
                    signal: state.compareController.signal,
                });
                countResult = countResponse.result;
            }
            const result = combinedResult(schemaResponse.result, countResult);
            state.schemaResults.set(tableId, result);
            appendSchemaResult(tableId, result);
            const logLevel = result.overall_status === "match" ? "READY" : "WARN";
            const countMessage = countResult ? ` ${countResult.summary}` : "";
            addLog(logLevel, `${tableId}: ${schemaResponse.result.summary}${countMessage}`);
        } catch (error) {
            if (error.name === "AbortError" && state.stopRequested) break;
            const result = {
                status: "error",
                summary: error.message,
                sqlserver_table: tableId,
                postgres_table: tableId,
                columns: [],
                key_status: "not_available",
                overall_status: "error",
                row_counts: null,
            };
            state.schemaResults.set(tableId, result);
            appendSchemaResult(tableId, result);
            addLog("WARN", `${tableId}: ${error.message}`);
        }
        completed += 1;
        setProgress(
            completed,
            tableIds.length,
            includeCounts ? "Comparing schemas and row counts" : "Comparing table schemas",
            `${completed} of ${tableIds.length} tables completed.`,
        );
    }

    const stopped = state.stopRequested;
    state.comparing = false;
    state.compareController = null;
    window.clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
    updateElapsedTime();
    elements.stopCompare.disabled = true;
    elements.startCompare.disabled = state.selectedTables.size === 0;
    elements.currentTable.textContent = "—";
    setProgress(
        completed,
        tableIds.length,
        stopped
            ? "Comparison stopped"
            : includeCounts
                ? "Schema and row-count comparison complete"
                : "Schema comparison complete",
        stopped
            ? `Stopped safely after ${completed} of ${tableIds.length} tables.`
            : includeCounts
                ? `${completed} table schemas and row counts reviewed.`
                : `${completed} table schemas reviewed.`,
    );
    addLog(
        stopped ? "WARN" : "READY",
        stopped
            ? "Comparison stopped by user."
            : includeCounts
                ? "Schema and row-count comparison completed."
                : "Schema comparison completed.",
    );
    showToast(
        stopped
            ? "Comparison stopped safely."
            : includeCounts
                ? "Schema and row-count comparison complete."
                : "Schema comparison complete.",
    );
    renderCurrentPageFromCache();
}

function renderCurrentPageFromCache() {
    currentCheckboxes().forEach((checkbox) => {
        const row = checkbox.closest("tr");
        const result = state.schemaResults.get(row.dataset.id);
        if (!result) return;
        row.querySelector(".column-summary").textContent =
            `${result.sqlserver_column_count ?? 0} / ${result.postgres_column_count ?? 0}`;
        row.querySelector(".key-summary").textContent =
            result.comparison_key?.join(", ")
            || (result.key_status === "different" ? "Keys differ" : "Key required");
    });
}

elements.sqlAuthentication.addEventListener("change", () => {
    const needsCredentials = elements.sqlAuthentication.value === "credentials";
    elements.sqlCredentials.classList.toggle("is-hidden", !needsCredentials);
    elements.sqlForm.elements.username.required = needsCredentials;
    elements.sqlForm.elements.password.required = needsCredentials;
    markFormChanged("sql");
});

elements.sqlForm.addEventListener("submit", (event) => {
    event.preventDefault();
    testConnection(elements.sqlForm, "sql", "sqlserver");
});
elements.pgForm.addEventListener("submit", (event) => {
    event.preventDefault();
    testConnection(elements.pgForm, "pg", "postgres");
});
elements.sqlForm.addEventListener("input", () => markFormChanged("sql"));
elements.sqlForm.addEventListener("change", () => markFormChanged("sql"));
elements.pgForm.addEventListener("input", () => markFormChanged("pg"));
elements.pgForm.addEventListener("change", () => markFormChanged("pg"));

document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
        const field = button.previousElementSibling;
        const show = field.type === "password";
        field.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute("aria-label", `${show ? "Hide" : "Show"} password`);
    });
});

elements.loadTablesButton.addEventListener("click", () => loadTables({
    resetPage: true,
    scroll: true,
    refreshCatalog: true,
}));
elements.tableSearch.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
        loadTables({ resetPage: true });
    }, 180);
});
elements.tableStatusFilters.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
        window.clearTimeout(state.searchTimer);
        loadTables({ resetPage: true });
    });
});
elements.selectAllTables.addEventListener("change", () => {
    state.currentMatchingIds.forEach((id) => {
        if (elements.selectAllTables.checked) state.selectedTables.add(id);
        else state.selectedTables.delete(id);
    });
    currentCheckboxes().forEach((checkbox) => {
        checkbox.checked = elements.selectAllTables.checked;
    });
    updateSelectionCount();
});
elements.tablePageSize.addEventListener("change", () => {
    state.tablePageSize = Number(elements.tablePageSize.value);
    loadTables({ resetPage: true });
});
elements.previousTablePage.addEventListener("click", () => {
    if (state.tablePage > 1) {
        state.tablePage -= 1;
        loadTables();
    }
});
elements.nextTablePage.addEventListener("click", () => {
    if (state.tablePage < state.tableTotalPages) {
        state.tablePage += 1;
        loadTables();
    }
});
elements.clearSelection.addEventListener("click", () => {
    state.selectedTables.clear();
    currentCheckboxes().forEach((checkbox) => { checkbox.checked = false; });
    updateSelectionCount();
});
elements.comparisonMode.addEventListener("change", updateEstimatedWork);

elements.startCompare.addEventListener("click", runSchemaComparison);
elements.stopCompare.addEventListener("click", () => {
    if (!state.comparing) return;
    state.stopRequested = true;
    elements.stopCompare.disabled = true;
    elements.progressStatus.textContent = "Stopping safely after the current table query finishes…";
});
elements.resultsTab.addEventListener("click", () => activateTab("results"));
elements.logTab.addEventListener("click", () => activateTab("log"));
document.querySelector("#copyLog").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(elements.logWindow.innerText);
        showToast("Execution log copied.");
    } catch {
        showToast("Clipboard access is unavailable in this browser.");
    }
});
document.querySelector("#themeInfo").addEventListener("click", () => {
    showToast("Phase 4 · Schema and row-count comparison · Local access only.");
});
document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "1") activateTab("results");
    if (event.altKey && event.key === "2") activateTab("log");
});

updatePagination();
