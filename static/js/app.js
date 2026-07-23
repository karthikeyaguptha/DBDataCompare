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
    selectAllMatching: false,
    selectedTables: new Set(),
    excludedTables: new Set(),
    searchTimer: null,
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
    selectAllTables: document.querySelector("#selectAllTables"),
    clearSelection: document.querySelector("#clearSelection"),
    selectionCount: document.querySelector("#selectionCount"),
    tablePageSize: document.querySelector("#tablePageSize"),
    tablePageRange: document.querySelector("#tablePageRange"),
    tablePageStatus: document.querySelector("#tablePageStatus"),
    previousTablePage: document.querySelector("#previousTablePage"),
    nextTablePage: document.querySelector("#nextTablePage"),
    selectedSummary: document.querySelector("#selectedSummary"),
    comparisonMode: document.querySelector("#comparisonMode"),
    batchSize: document.querySelector("#batchSize"),
    startCompare: document.querySelector("#startCompare"),
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
    state.tablesLoaded = false;
    state.selectAllMatching = false;
    state.selectedTables.clear();
    state.excludedTables.clear();
    elements.tablesOverlay.classList.remove("is-hidden");
    [elements.tableSearch, elements.selectAllTables, elements.clearSelection, elements.tablePageSize]
        .forEach((control) => { control.disabled = true; });
    elements.tablesBody.replaceChildren();
    updateSelectionCount();
}

function unlockTableWorkspace() {
    state.tablesLoaded = true;
    elements.tablesOverlay.classList.add("is-hidden");
    [elements.tableSearch, elements.selectAllTables, elements.clearSelection, elements.tablePageSize]
        .forEach((control) => { control.disabled = false; });
    elements.comparisonMode.disabled = false;
    elements.batchSize.disabled = false;
    document.querySelector("[data-step='2']").classList.add("complete");
    document.querySelector("[data-step='3']").classList.add("active");
}

async function loadTables({ resetPage = false, scroll = false } = {}) {
    if (!state.sqlValidated || !state.pgValidated) {
        showToast("Test both connections again before loading tables.");
        return;
    }
    if (resetPage) state.tablePage = 1;
    elements.loadTablesButton.disabled = true;
    elements.loadTablesButton.classList.add("is-loading");
    elements.loadTablesButton.textContent = "Loading tables…";

    try {
        const result = await requestJson("/api/tables", {
            method: "POST",
            body: JSON.stringify({
                sqlserver: connectionConfig("sql"),
                postgres: connectionConfig("pg"),
                search: elements.tableSearch.value,
                page: state.tablePage,
                page_size: state.tablePageSize,
            }),
        });
        state.tablePage = result.pagination.page;
        state.tableTotal = result.pagination.total;
        state.tableTotalPages = result.pagination.total_pages;
        renderTableRows(result.tables);
        unlockTableWorkspace();
        updatePagination();
        addLog("INFO", `Loaded ${result.tables.length} of ${state.tableTotal} matching table names.`);
        if (scroll) {
            document.querySelector("#tablesSection").scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } catch (error) {
        addLog("WARN", error.message);
        showToast(error.message);
    } finally {
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
        row.innerHTML = `
            <td><input class="table-checkbox" type="checkbox"></td>
            <td><strong></strong><small></small></td>
            <td><strong></strong><small></small></td>
            <td><span class="muted-value">Phase 3</span></td>
            <td><span class="muted-value">Phase 3</span></td>
            <td><span class="status-chip ${status[1]}">${status[0]}</span></td>`;
        const checkbox = row.querySelector(".table-checkbox");
        checkbox.setAttribute("aria-label", `Select ${sqlName !== "Not found" ? sqlName : pgName} table`);
        checkbox.checked = state.selectAllMatching
            ? !state.excludedTables.has(table.id)
            : state.selectedTables.has(table.id);
        checkbox.addEventListener("change", () => {
            if (state.selectAllMatching) {
                if (checkbox.checked) state.excludedTables.delete(table.id);
                else state.excludedTables.add(table.id);
            } else if (checkbox.checked) {
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
        elements.tablesBody.append(row);
    });
    updateSelectionCount();
}

function currentCheckboxes() {
    return [...elements.tablesBody.querySelectorAll(".table-checkbox")];
}

function updateSelectionCount() {
    const selectedCount = state.selectAllMatching
        ? Math.max(0, state.tableTotal - state.excludedTables.size)
        : state.selectedTables.size;
    elements.selectionCount.textContent = `${selectedCount} selected`;
    elements.selectedSummary.textContent = String(selectedCount);
    elements.startCompare.disabled = selectedCount === 0;
    elements.selectAllTables.checked = state.selectAllMatching && state.excludedTables.size === 0;
    elements.selectAllTables.indeterminate = selectedCount > 0 && !elements.selectAllTables.checked;
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

elements.loadTablesButton.addEventListener("click", () => loadTables({ resetPage: true, scroll: true }));
elements.tableSearch.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
        state.selectAllMatching = false;
        state.selectedTables.clear();
        state.excludedTables.clear();
        loadTables({ resetPage: true });
    }, 300);
});
elements.selectAllTables.addEventListener("change", () => {
    state.selectAllMatching = elements.selectAllTables.checked;
    state.selectedTables.clear();
    state.excludedTables.clear();
    elements.tablesBody.querySelectorAll("tr[data-id]").forEach((row) => {
        const checkbox = row.querySelector(".table-checkbox");
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
    state.selectAllMatching = false;
    state.selectedTables.clear();
    state.excludedTables.clear();
    currentCheckboxes().forEach((checkbox) => { checkbox.checked = false; });
    updateSelectionCount();
});

elements.startCompare.addEventListener("click", () => {
    showToast("Table and column comparison begins in Phase 3.");
    addLog("INFO", "Comparison requested; schema comparison is not enabled in Phase 2.");
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
    showToast("Phase 2 · Live database connectivity · Local access only.");
});
document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "1") activateTab("results");
    if (event.altKey && event.key === "2") activateTab("log");
});

updatePagination();
