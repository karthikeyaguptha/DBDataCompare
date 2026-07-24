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
    manualKeys: new Map(),
    searchTimer: null,
    tableRequestController: null,
    tableRequestId: 0,
    schemaResults: new Map(),
    comparing: false,
    stopRequested: false,
    stopMode: "",
    compareController: null,
    activeOperationId: "",
    activeDataJobId: null,
    elapsedTimer: null,
    comparisonStartedAt: null,
    reportRunId: "",
    reportStartedAt: "",
    reportFiles: {},
    lastRunDurationSeconds: 0,
    profiles: [],
    currentProfileId: "",
    pendingProfileSelection: new Set(),
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
    clearTableSearch: document.querySelector("#clearTableSearch"),
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
    ignoreTrailingSpaces: document.querySelector("#ignoreTrailingSpaces"),
    caseSensitiveText: document.querySelector("#caseSensitiveText"),
    decimalTolerance: document.querySelector("#decimalTolerance"),
    timestampTolerance: document.querySelector("#timestampTolerance"),
    startCompare: document.querySelector("#startCompare"),
    stopCompare: document.querySelector("#stopCompare"),
    stopNow: document.querySelector("#stopNow"),
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
    profileSelect: document.querySelector("#profileSelect"),
    loadProfile: document.querySelector("#loadProfile"),
    saveProfile: document.querySelector("#saveProfile"),
    deleteProfile: document.querySelector("#deleteProfile"),
    reportType: document.querySelector("#reportType"),
    exportReport: document.querySelector("#exportReport"),
    exportLog: document.querySelector("#exportLog"),
    toast: document.querySelector("#toast"),
    themeToggle: document.querySelector("#themeToggle"),
    backToTop: document.querySelector("#backToTop"),
};

let toastTimer;

function applyTheme(theme, persist = true) {
    const selected = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = selected;
    const dark = selected === "dark";
    elements.themeToggle.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
    elements.themeToggle.querySelector(".theme-label").textContent = dark ? "Light" : "Dark";
    elements.themeToggle.setAttribute(
        "aria-label",
        `Switch to ${dark ? "light" : "dark"} theme`,
    );
    if (persist) {
        try {
            localStorage.setItem("db-compare-theme", selected);
        } catch {
            // Theme still applies for this session when browser storage is unavailable.
        }
    }
}

function newOperationId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `operation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

function connectionConfigWithoutPassword(prefix) {
    const config = connectionConfig(prefix);
    delete config.password;
    return config;
}

function fillForm(form, values) {
    Object.entries(values || {}).forEach(([name, value]) => {
        const field = form.elements[name];
        if (!field || name === "password") return;
        if (field.type === "checkbox") field.checked = Boolean(value);
        else field.value = value ?? "";
    });
    if (form.elements.password) form.elements.password.value = "";
}

function profilePayload(name, id = "") {
    return {
        id,
        name,
        sqlserver: connectionConfigWithoutPassword("sql"),
        postgres: connectionConfigWithoutPassword("pg"),
        selected_tables: [...state.selectedTables],
        manual_keys: Object.fromEntries(state.manualKeys),
        statuses: activeTableStatuses(),
        comparison_mode: elements.comparisonMode.value,
        batch_size: Number(elements.batchSize.value),
        options: comparisonOptions(),
    };
}

async function refreshProfiles(selectId = "") {
    try {
        const result = await requestJson("/api/profiles", { method: "GET" });
        state.profiles = result.profiles || [];
        elements.profileSelect.replaceChildren(new Option("No saved profile", ""));
        state.profiles.forEach((profile) => {
            elements.profileSelect.add(new Option(profile.name, profile.id));
        });
        elements.profileSelect.value = selectId
            && state.profiles.some((profile) => profile.id === selectId)
            ? selectId
            : "";
        updateProfileButtons();
    } catch (error) {
        addLog("WARN", error.message);
    }
}

function updateProfileButtons() {
    const selected = Boolean(elements.profileSelect.value);
    elements.loadProfile.disabled = !selected || state.comparing;
    elements.deleteProfile.disabled = !selected || state.comparing;
    elements.saveProfile.disabled = state.comparing;
}

function applyProfile(profile) {
    const savedManualKeys = new Map(Object.entries(profile.manual_keys || {}));
    fillForm(elements.sqlForm, profile.sqlserver);
    fillForm(elements.pgForm, profile.postgres);
    elements.sqlAuthentication.dispatchEvent(new Event("change"));
    elements.tableStatusFilters.forEach((checkbox) => {
        checkbox.checked = (profile.statuses || ["available"]).includes(checkbox.value);
    });
    elements.comparisonMode.value = profile.comparison_mode || "full";
    elements.batchSize.value = String(profile.batch_size || 5000);
    elements.ignoreTrailingSpaces.checked = Boolean(profile.options?.ignore_trailing_spaces);
    elements.caseSensitiveText.checked = profile.options?.case_sensitive !== false;
    elements.decimalTolerance.value = profile.options?.decimal_tolerance || "0";
    elements.timestampTolerance.value = profile.options?.timestamp_tolerance_ms || "0";
    state.pendingProfileSelection = new Set(profile.selected_tables || []);
    state.currentProfileId = profile.id;
    state.sqlValidated = false;
    state.pgValidated = false;
    state.sqlSignature = "";
    state.pgSignature = "";
    ["sql", "pg"].forEach((prefix) => {
        const badge = document.querySelector(`#${prefix}State`);
        const feedback = document.querySelector(`#${prefix}Feedback`);
        badge.textContent = "Not tested";
        badge.className = "connection-state neutral";
        feedback.textContent = "Enter the password, then test this connection.";
        feedback.style.color = "var(--ink-faint)";
    });
    elements.loadTablesButton.disabled = true;
    lockTables();
    state.manualKeys = savedManualKeys;
    updateEstimatedWork();
    addLog("INFO", `Loaded profile "${profile.name}". Passwords must be entered again.`);
    showToast(`Profile loaded. Enter passwords and retest both connections.`);
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
    state.manualKeys.clear();
    state.schemaResults.clear();
    resetSchemaResults();
    elements.tablesOverlay.classList.remove("is-hidden");
    [elements.tableSearch, elements.clearTableSearch, ...elements.tableStatusFilters, elements.selectAllTables, elements.clearSelection, elements.tablePageSize]
        .forEach((control) => { control.disabled = true; });
    elements.tablesBody.replaceChildren();
    updateSelectionCount();
}

function unlockTableWorkspace() {
    state.tablesLoaded = true;
    elements.tablesOverlay.classList.add("is-hidden");
    [elements.tableSearch, elements.clearTableSearch, ...elements.tableStatusFilters, elements.selectAllTables, elements.clearSelection, elements.tablePageSize]
        .forEach((control) => { control.disabled = false; });
    elements.comparisonMode.disabled = false;
    elements.batchSize.disabled = elements.comparisonMode.value !== "full";
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
        if (state.pendingProfileSelection.size) {
            state.selectedTables = new Set(
                result.matching_ids.filter((id) => state.pendingProfileSelection.has(id)),
            );
            state.pendingProfileSelection.clear();
        }
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
        const keySummary = state.manualKeys.get(table.id)?.join(", ")
            || priorResult?.comparison_key?.join(", ")
            || (priorResult?.key_status === "different" ? "Keys differ" : "");
        row.innerHTML = `
            <td><input class="table-checkbox" type="checkbox"></td>
            <td><strong></strong><small></small></td>
            <td><strong></strong><small></small></td>
            <td><span class="column-summary"></span></td>
            <td>
                <input class="key-input" type="text" autocomplete="off"
                    placeholder="Auto-detect or col1, col2"
                    aria-label="Manual comparison key">
                <small class="key-hint"></small>
            </td>
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
        const keyInput = cells[4].querySelector(".key-input");
        const keyHint = cells[4].querySelector(".key-hint");
        keyInput.value = state.manualKeys.get(table.id)?.join(", ") || "";
        keyHint.textContent = keySummary
            ? `${state.manualKeys.has(table.id) ? "Manual" : "Detected"}: ${keySummary}`
            : "Leave blank for automatic detection";
        keyInput.addEventListener("change", () => {
            const values = keyInput.value.split(",").map((value) => value.trim()).filter(Boolean);
            if (values.length) state.manualKeys.set(table.id, values);
            else state.manualKeys.delete(table.id);
            keyHint.textContent = values.length
                ? `Manual: ${values.join(", ")}`
                : priorResult?.comparison_key?.length
                    ? `Detected: ${priorResult.comparison_key.join(", ")}`
                    : "Leave blank for automatic detection";
        });
        if (!priorResult) {
            cells[3].firstElementChild.classList.add("muted-value");
            keyHint.classList.add("muted-value");
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
    const mode = elements.comparisonMode.value;
    elements.estimatedWork.textContent = selectedCount
        ? mode === "full"
            ? `${selectedCount} complete table comparison${selectedCount === 1 ? "" : "s"}`
            : mode === "schema_and_counts"
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

function matchedResultLabel(result) {
    const checks = [
        { name: "Schema", ran: true, matched: result.status === "match" },
        {
            name: "count",
            ran: Boolean(result.row_counts),
            matched: result.row_counts?.status === "match",
        },
        {
            name: "data",
            ran: Boolean(result.data_result),
            matched: result.data_result?.status === "match",
        },
    ].filter((check) => check.ran);
    const matched = checks.filter((check) => check.matched);
    if (!matched.length) return null;

    const names = matched.map((check) => check.name);
    const label = names.length === 1
        ? `${names[0]} match`
        : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} match`;
    const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const everyCompletedCheckMatched = matched.length === checks.length;
    const complete = everyCompletedCheckMatched && !result.data_skipped;
    return [displayLabel, complete ? "ready" : "warning"];
}

function resultStatus(result) {
    const status = result.overall_status || result.status;
    if (status === "missing_table") return ["Table missing", "missing"];
    if (status === "error") return ["Error", "missing"];
    if (status === "stopped_immediately") return ["Stopped now", "missing"];
    if (status === "cancelled") return ["Safe stop", "warning"];
    const matched = matchedResultLabel(result);
    if (matched) return matched;
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

    const dataDifferenceCell = document.createElement("td");
    if (result.data_result) {
        dataDifferenceCell.textContent = result.data_result.status === "stopped_immediately"
            ? "Stopped now"
            : result.data_result.status === "cancelled"
            ? "Safe stop"
            : formatCount(result.data_result.mismatch_total);
        if (result.data_result.mismatch_total) {
            dataDifferenceCell.classList.add("count-difference");
        }
    } else {
        dataDifferenceCell.textContent = result.data_skipped || "Not run";
        dataDifferenceCell.classList.add("muted-value");
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
    detailButton.textContent = result.columns?.length || result.data_result ? "View details" : "No details";
    detailButton.disabled = !result.columns?.length && !result.data_result;
    actionCell.append(detailButton);
    row.append(
        tableCell,
        columnsCell,
        differenceCell,
        rowCountsCell,
        rowDifferenceCell,
        dataDifferenceCell,
        keyCell,
        statusCell,
        actionCell,
    );

    const detailRow = document.createElement("tr");
    detailRow.className = "schema-detail-row is-hidden";
    const detailCell = document.createElement("td");
    detailCell.colSpan = 9;
    detailCell.append(buildResultDetails(result));
    detailRow.append(detailCell);
    detailButton.addEventListener("click", () => {
        const opening = detailRow.classList.contains("is-hidden");
        detailRow.classList.toggle("is-hidden", !opening);
        detailButton.textContent = opening ? "Hide details" : "View details";
    });
    elements.resultsBody.append(row, detailRow);
    elements.resultsCount.textContent = String(state.schemaResults.size);
}

function buildResultDetails(result) {
    const wrap = document.createElement("div");
    wrap.className = "result-detail-stack";
    if (result.columns?.length) {
        const heading = document.createElement("h3");
        heading.textContent = "Column comparison";
        wrap.append(heading, buildColumnDetails(result.columns));
    }
    if (result.data_result) {
        const heading = document.createElement("h3");
        heading.textContent = "Row-data comparison";
        wrap.append(heading, buildDataDetails(result.data_result));
    } else if (result.data_skipped) {
        const note = document.createElement("p");
        note.className = "data-skip-note";
        note.textContent = result.data_skipped;
        wrap.append(note);
    }
    return wrap;
}

function buildDataDetails(dataResult) {
    const wrap = document.createElement("div");
    wrap.className = "data-detail-wrap";
    const counts = dataResult.counts || {};
    const summary = document.createElement("div");
    summary.className = "data-summary-grid";
    [
        ["Matched", counts.matched || 0],
        ["Value mismatch", counts.different || 0],
        ["SQL Server only", counts.sql_only || 0],
        ["PostgreSQL only", counts.postgres_only || 0],
        ["Processed", dataResult.processed || 0],
    ].forEach(([label, value]) => {
        const item = document.createElement("div");
        const title = document.createElement("span");
        const count = document.createElement("strong");
        title.textContent = label;
        count.textContent = formatCount(value);
        item.append(title, count);
        summary.append(item);
    });
    wrap.append(summary);

    if (!dataResult.preview?.length) {
        const note = document.createElement("p");
        note.className = "data-skip-note";
        note.textContent = dataResult.status === "match"
            ? "Every compared row and value matched."
            : "No mismatch preview is available.";
        wrap.append(note);
        return wrap;
    }

    const table = document.createElement("table");
    table.className = "column-detail-table data-detail-table";
    table.innerHTML = "<thead><tr><th>Type</th><th>Key</th><th>Details</th></tr></thead><tbody></tbody>";
    const body = table.querySelector("tbody");
    dataResult.preview.forEach((item) => {
        const row = document.createElement("tr");
        const kind = {
            different: "Value mismatch",
            sql_only: "SQL Server only",
            postgres_only: "PostgreSQL only",
        }[item.kind] || item.kind;
        const details = item.differences?.map((difference) =>
            `${difference.column}: SQL=${displayValue(difference.sqlserver)} · PG=${displayValue(difference.postgres)}`
        ).join(" | ") || "Row is missing from the other database.";
        [kind, JSON.stringify(item.key), details].forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        });
        body.append(row);
    });
    wrap.append(table);
    if (dataResult.preview_limited) {
        const note = document.createElement("p");
        note.className = "preview-limit-note";
        note.textContent = "Showing the first 200 differences. Export JSONL for the complete mismatch list.";
        wrap.append(note);
    }
    return wrap;
}

function displayValue(value) {
    if (value === null) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
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

function combinedResult(schemaResult, countResult, dataResult = null, dataSkipped = "") {
    const overallStatus = dataResult?.status === "stopped_immediately"
        ? "stopped_immediately"
        : dataResult?.status === "cancelled"
            ? "cancelled"
        : schemaResult.status === "error"
        ? "error"
        : schemaResult.status === "missing_table"
            ? "missing_table"
            : schemaResult.status === "different"
                || countResult?.status === "different"
                || dataResult?.status === "different"
                ? "different"
                : "match";
    return {
        ...schemaResult,
        overall_status: overallStatus,
        row_counts: countResult || null,
        data_result: dataResult,
        data_skipped: dataSkipped,
    };
}

function reportTableSummaries() {
    return [...state.schemaResults.entries()].map(([tableId, result]) => {
        const columnCounts = result.counts || {};
        const dataCounts = result.data_result?.counts || {};
        return {
            table_id: tableId,
            sqlserver_table: result.sqlserver_table || "",
            postgres_table: result.postgres_table || "",
            status: result.data_result?.status === "stopped_immediately"
                ? "stopped_immediately"
                : result.data_result?.status === "cancelled"
                ? "cancelled"
                : result.overall_status || result.status,
            summary: [
                result.summary,
                result.row_counts?.summary,
                result.data_result?.summary,
                result.data_skipped,
            ].filter(Boolean).join(" "),
            sqlserver_columns: result.sqlserver_column_count || 0,
            postgres_columns: result.postgres_column_count || 0,
            column_differences: (columnCounts.different || 0) + (columnCounts.missing || 0),
            row_counts: result.row_counts || {},
            comparison_key: result.comparison_key || [],
            data_counts: dataCounts,
            processed_rows: result.data_result?.processed || 0,
            data_skipped: result.data_skipped || "",
        };
    });
}

function collectLogEntries() {
    return [...elements.logWindow.children].map((row) => ({
        timestamp: row.querySelector("time")?.textContent || "",
        level: row.querySelector(".log-level")?.textContent || "",
        message: row.lastElementChild?.textContent || "",
    }));
}

function setReportExports(files = {}) {
    state.reportFiles = files;
    const available = Object.keys(files).length > 0;
    elements.reportType.disabled = !available;
    elements.exportReport.disabled = !available;
    elements.exportLog.disabled = !files.log;
}

function downloadReport(kind) {
    const url = state.reportFiles[kind];
    if (!url) {
        showToast("Complete a comparison before exporting reports.");
        return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
}

async function finalizeCurrentReport(cancelled, stopMode = "") {
    if (!state.reportRunId) return;
    const result = await requestJson(
        `/api/reports/${state.reportRunId}/finalize`,
        {
            method: "POST",
            body: JSON.stringify({
                started_at: state.reportStartedAt,
                duration_seconds: state.lastRunDurationSeconds,
                comparison_mode: elements.comparisonMode.value,
                batch_size: Number(elements.batchSize.value),
                comparison_options: comparisonOptions(),
                cancelled,
                stop_mode: stopMode,
                tables: reportTableSummaries(),
                log_entries: collectLogEntries(),
            }),
        },
    );
    setReportExports(result.files || {});
    addLog(
        ["cancelled", "stopped_immediately"].includes(result.status) ? "WARN" : "READY",
        `Report files saved for run ${result.run_id}.`,
    );
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

function comparisonOptions() {
    return {
        ignore_trailing_spaces: elements.ignoreTrailingSpaces.checked,
        case_sensitive: elements.caseSensitiveText.checked,
        decimal_tolerance: elements.decimalTolerance.value || "0",
        timestamp_tolerance_ms: elements.timestampTolerance.value || "0",
    };
}

async function waitForDataComparison(jobId, tableId) {
    state.activeDataJobId = jobId;
    while (true) {
        if (state.stopRequested && state.stopMode === "safe") {
            await requestJson(`/api/data/compare/${jobId}/cancel`, {
                method: "POST",
                body: "{}",
            }).catch(() => {});
        }
        const response = await requestJson(`/api/data/compare/${jobId}`, {
            method: "GET",
        });
        elements.progressStatus.textContent =
            `Comparing ${tableId}: ${formatCount(response.processed)} row positions processed.`;
        if (["complete", "cancelled", "stopped_immediately"].includes(response.status)) {
            state.activeDataJobId = null;
            return response.result;
        }
        if (response.status === "error") {
            state.activeDataJobId = null;
            throw new Error(response.message || "Data comparison failed.");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 450));
    }
}

async function runSchemaComparison() {
    if (state.comparing || !state.selectedTables.size) return;
    const tableIds = [...state.selectedTables];
    const mode = elements.comparisonMode.value;
    try {
        const report = await requestJson("/api/reports/runs", {
            method: "POST",
            body: JSON.stringify({
                comparison_mode: mode,
                selected_tables: tableIds,
            }),
        });
        state.reportRunId = report.run_id;
        state.reportStartedAt = report.started_at;
        setReportExports();
    } catch (error) {
        addLog("WARN", error.message);
        showToast("The report run could not be created. Comparison was not started.");
        return;
    }
    state.comparing = true;
    updateProfileButtons();
    state.stopRequested = false;
    state.stopMode = "";
    state.schemaResults.clear();
    resetSchemaResults();
    elements.startCompare.disabled = true;
    elements.stopCompare.disabled = false;
    elements.stopNow.disabled = false;
    elements.currentTable.textContent = "Preparing…";
    state.comparisonStartedAt = Date.now();
    window.clearInterval(state.elapsedTimer);
    updateElapsedTime();
    state.elapsedTimer = window.setInterval(updateElapsedTime, 1000);
    const includeCounts = mode !== "schema_only";
    const includeData = mode === "full";
    const runTitle = includeData
        ? "Running full comparison"
        : includeCounts
            ? "Comparing schemas and row counts"
            : "Comparing table schemas";
    setProgress(
        0,
        tableIds.length,
        runTitle,
        includeData
            ? "Reading metadata, counts, and row values in bounded batches."
            : includeCounts
                ? "Reading column metadata, keys, and exact row counts."
            : "Reading column metadata and keys.",
    );
    activateTab("results");
    addLog(
        "INFO",
        `${includeData ? "Full" : includeCounts ? "Schema and row-count" : "Schema"} comparison started for ${tableIds.length} table(s).`,
    );

    let completed = 0;
    for (const tableId of tableIds) {
        if (state.stopRequested) break;
        elements.currentTable.textContent = tableId;
        elements.progressStatus.textContent = `Comparing ${tableId}`;
        state.compareController = new AbortController();
        state.activeOperationId = newOperationId();
        try {
            const schemaResponse = await requestJson("/api/schema/compare", {
                method: "POST",
                body: JSON.stringify({
                    sqlserver: connectionConfig("sql"),
                    postgres: connectionConfig("pg"),
                    catalog_token: state.catalogToken,
                    table_id: tableId,
                    operation_id: state.activeOperationId,
                }),
                signal: state.compareController.signal,
            });
            let countResult = null;
            if (includeCounts && schemaResponse.result.status !== "error") {
                state.activeOperationId = newOperationId();
                elements.progressStatus.textContent =
                    `Counting rows in ${tableId}. Exact counts can take longer for large tables.`;
                const countResponse = await requestJson("/api/counts/compare", {
                    method: "POST",
                    body: JSON.stringify({
                        sqlserver: connectionConfig("sql"),
                        postgres: connectionConfig("pg"),
                        catalog_token: state.catalogToken,
                        table_id: tableId,
                        operation_id: state.activeOperationId,
                    }),
                    signal: state.compareController.signal,
                });
                countResult = countResponse.result;
            }
            let dataResult = null;
            let dataSkipped = "";
            const manualKey = state.manualKeys.get(tableId) || [];
            const comparisonKey = manualKey.length
                ? manualKey
                : schemaResponse.result.comparison_key || [];
            if (manualKey.length) {
                schemaResponse.result.comparison_key = manualKey;
                schemaResponse.result.key_status = "manual";
            }
            if (includeData) {
                if (schemaResponse.result.status === "missing_table") {
                    dataSkipped = "Data comparison requires the table in both databases.";
                } else if (!comparisonKey.length) {
                    dataSkipped = "Manual comparison key required. Enter column names in Step 2 and run again.";
                    addLog("WARN", `${tableId}: ${dataSkipped}`);
                } else {
                    elements.progressStatus.textContent =
                        `Starting batch data comparison for ${tableId}.`;
                    const startResponse = await requestJson("/api/data/compare/start", {
                        method: "POST",
                        body: JSON.stringify({
                            sqlserver: connectionConfig("sql"),
                            postgres: connectionConfig("pg"),
                            catalog_token: state.catalogToken,
                            table_id: tableId,
                            comparison_key: manualKey,
                            batch_size: Number(elements.batchSize.value),
                            options: comparisonOptions(),
                            report_run_id: state.reportRunId,
                        }),
                    });
                    dataResult = await waitForDataComparison(startResponse.job_id, tableId);
                    if (dataResult?.status === "cancelled") {
                        state.stopRequested = true;
                        state.stopMode = "safe";
                    } else if (dataResult?.status === "stopped_immediately") {
                        state.stopRequested = true;
                        state.stopMode = "immediate";
                    }
                }
            }
            const result = combinedResult(
                schemaResponse.result,
                countResult,
                dataResult,
                dataSkipped,
            );
            state.schemaResults.set(tableId, result);
            appendSchemaResult(tableId, result);
            const logLevel = result.overall_status === "match" ? "READY" : "WARN";
            const countMessage = countResult ? ` ${countResult.summary}` : "";
            const dataMessage = dataResult ? ` ${dataResult.summary}` : dataSkipped ? ` ${dataSkipped}` : "";
            addLog(logLevel, `${tableId}: ${schemaResponse.result.summary}${countMessage}${dataMessage}`);
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
                data_result: null,
                data_skipped: "",
            };
            state.schemaResults.set(tableId, result);
            appendSchemaResult(tableId, result);
            addLog("WARN", `${tableId}: ${error.message}`);
        }
        state.activeOperationId = "";
        completed += 1;
        setProgress(
            completed,
            tableIds.length,
            runTitle,
            `${completed} of ${tableIds.length} tables completed.`,
        );
    }

    const stopped = state.stopRequested;
    state.comparing = false;
    updateProfileButtons();
    state.compareController = null;
    state.activeOperationId = "";
    window.clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
    updateElapsedTime();
    state.lastRunDurationSeconds = state.comparisonStartedAt
        ? Math.max(0, (Date.now() - state.comparisonStartedAt) / 1000)
        : 0;
    elements.stopCompare.disabled = true;
    elements.stopNow.disabled = true;
    elements.startCompare.disabled = state.selectedTables.size === 0;
    elements.currentTable.textContent = "—";
    setProgress(
        completed,
        tableIds.length,
        stopped
            ? state.stopMode === "immediate"
                ? "Comparison stopped immediately"
                : "Comparison stopped safely"
            : includeData
                ? "Schema, row count, and data comparison complete"
                : includeCounts
                ? "Schema and row-count comparison complete"
                : "Schema comparison complete",
        stopped
            ? state.stopMode === "immediate"
                ? `Immediate cancellation requested after ${completed} of ${tableIds.length} tables. Completed results were preserved.`
                : `Stopped safely after ${completed} of ${tableIds.length} tables.`
            : includeData
                ? `${completed} table structures, counts, and data sets reviewed.`
                : includeCounts
                ? `${completed} table schemas and row counts reviewed.`
                : `${completed} table schemas reviewed.`,
    );
    addLog(
        stopped ? "WARN" : "READY",
        stopped
            ? state.stopMode === "immediate"
                ? "Comparison stopped immediately by user. Only completed work was preserved."
                : "Comparison stopped safely by user."
            : includeData
                ? "Full data comparison completed."
                : includeCounts
                ? "Schema and row-count comparison completed."
                : "Schema comparison completed.",
    );
    try {
        await finalizeCurrentReport(stopped, state.stopMode);
    } catch (error) {
        addLog("WARN", `Report finalization failed: ${error.message}`);
        showToast("Comparison completed, but report files could not be finalized.");
    }
    showToast(
        stopped
            ? state.stopMode === "immediate"
                ? "Comparison stopped immediately."
                : "Comparison stopped safely."
            : includeData
                ? "Full data comparison complete."
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
        const keyHint = row.querySelector(".key-hint");
        if (keyHint) {
            keyHint.textContent = state.manualKeys.has(row.dataset.id)
                ? `Manual: ${state.manualKeys.get(row.dataset.id).join(", ")}`
                : result.comparison_key?.length
                    ? `Detected: ${result.comparison_key.join(", ")}`
                    : result.key_status === "different"
                        ? "Keys differ — enter a manual key"
                        : "Key required — enter column names";
        }
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
elements.clearTableSearch.addEventListener("click", () => {
    const hadSearch = Boolean(elements.tableSearch.value);
    elements.tableSearch.value = "";
    elements.tableSearch.focus();
    if (hadSearch) {
        window.clearTimeout(state.searchTimer);
        loadTables({ resetPage: true });
    }
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
elements.comparisonMode.addEventListener("change", () => {
    elements.batchSize.disabled = elements.comparisonMode.value !== "full";
    updateEstimatedWork();
});

elements.startCompare.addEventListener("click", runSchemaComparison);
elements.stopCompare.addEventListener("click", () => {
    if (!state.comparing) return;
    state.stopRequested = true;
    state.stopMode = "safe";
    elements.stopCompare.disabled = true;
    elements.progressStatus.textContent = state.activeDataJobId
        ? "Stopping safely after the current data batch finishes…"
        : "Stopping safely after the current database query finishes…";
    if (state.activeDataJobId) {
        requestJson(`/api/data/compare/${state.activeDataJobId}/cancel`, {
            method: "POST",
            body: "{}",
        }).catch(() => {});
    }
});
elements.stopNow.addEventListener("click", async () => {
    if (!state.comparing) return;
    const confirmed = window.confirm(
        "Stop immediately?\n\nThe active database operation will be cancelled where the driver supports it. "
        + "Only completed results will be preserved, and the current batch may be absent from the report.",
    );
    if (!confirmed) return;

    state.stopRequested = true;
    state.stopMode = "immediate";
    elements.stopCompare.disabled = true;
    elements.stopNow.disabled = true;
    elements.progressStatus.textContent =
        "Requesting immediate database cancellation…";
    addLog(
        "WARN",
        "Stop Now requested. Cancelling active database work and preserving completed results.",
    );

    const requests = [];
    if (state.activeDataJobId) {
        requests.push(
            requestJson(`/api/data/compare/${state.activeDataJobId}/cancel-now`, {
                method: "POST",
                body: "{}",
            }),
        );
    }
    if (state.activeOperationId) {
        requests.push(
            requestJson(`/api/operations/${state.activeOperationId}/cancel-now`, {
                method: "POST",
                body: "{}",
            }),
        );
    }
    await Promise.allSettled(requests);
    if (!state.activeDataJobId) state.compareController?.abort();
});
elements.resultsTab.addEventListener("click", () => activateTab("results"));
elements.logTab.addEventListener("click", () => activateTab("log"));
elements.profileSelect.addEventListener("change", updateProfileButtons);
elements.loadProfile.addEventListener("click", () => {
    const profile = state.profiles.find((item) => item.id === elements.profileSelect.value);
    if (profile) applyProfile(profile);
});
elements.saveProfile.addEventListener("click", async () => {
    const existing = state.profiles.find((item) => item.id === elements.profileSelect.value);
    const name = window.prompt("Profile name", existing?.name || "");
    if (name === null) return;
    try {
        const result = await requestJson("/api/profiles", {
            method: "POST",
            body: JSON.stringify(profilePayload(name.trim(), existing?.id || "")),
        });
        state.currentProfileId = result.profile.id;
        await refreshProfiles(result.profile.id);
        addLog("READY", result.message);
        showToast(result.message);
    } catch (error) {
        addLog("WARN", error.message);
        showToast(error.message);
    }
});
elements.deleteProfile.addEventListener("click", async () => {
    const profile = state.profiles.find((item) => item.id === elements.profileSelect.value);
    if (!profile || !window.confirm(`Delete saved profile "${profile.name}"?`)) return;
    try {
        const result = await requestJson(`/api/profiles/${profile.id}`, {
            method: "DELETE",
        });
        state.currentProfileId = "";
        await refreshProfiles();
        addLog("INFO", result.message);
        showToast(result.message);
    } catch (error) {
        addLog("WARN", error.message);
        showToast(error.message);
    }
});
elements.exportReport.addEventListener("click", () => downloadReport(elements.reportType.value));
elements.exportLog.addEventListener("click", () => downloadReport("log"));
document.querySelector("#copyLog").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(elements.logWindow.innerText);
        showToast("Execution log copied.");
    } catch {
        showToast("Clipboard access is unavailable in this browser.");
    }
});
document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "1") activateTab("results");
    if (event.altKey && event.key === "2") activateTab("log");
});

elements.themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
});
elements.backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});
window.addEventListener("scroll", () => {
    elements.backToTop.classList.toggle("visible", window.scrollY > 520);
}, { passive: true });

applyTheme(document.documentElement.dataset.theme || "light", false);
updatePagination();
setReportExports();
refreshProfiles();
