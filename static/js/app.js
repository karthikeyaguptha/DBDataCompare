"use strict";

const state = {
    sqlValidated: false,
    pgValidated: false,
    tablesLoaded: false,
    tablePage: 1,
    tablePageSize: 5,
};

const elements = {
    sqlForm: document.querySelector("#sqlForm"),
    pgForm: document.querySelector("#pgForm"),
    sqlAuthentication: document.querySelector("#sqlAuthentication"),
    sqlCredentials: document.querySelector("#sqlCredentials"),
    loadTablesButton: document.querySelector("#loadTablesButton"),
    tablesOverlay: document.querySelector("#tablesOverlay"),
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
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3200);
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
    badge.textContent = kind === "success" ? "UI validated" : "Check fields";
    badge.className = `connection-state ${kind}`;
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

    if (missing.length) {
        missing.forEach((field) => field.setAttribute("aria-invalid", "true"));
        missing[0].focus();
        showFeedback(prefix, `Complete ${missing.length} required field${missing.length > 1 ? "s" : ""}.`);
        addLog("WARN", `${prefix === "sql" ? "SQL Server" : "PostgreSQL"} form validation failed.`);
        return false;
    }

    showFeedback(prefix, "Form validated. Live connection testing arrives in Phase 2.", "success");
    state[`${prefix}Validated`] = true;
    addLog("READY", `${prefix === "sql" ? "SQL Server" : "PostgreSQL"} connection form validated for UI preview.`);
    updateConnectionState();
    return true;
}

function updateConnectionState() {
    const bothValidated = state.sqlValidated && state.pgValidated;
    elements.loadTablesButton.disabled = !bothValidated;

    if (bothValidated) {
        document.querySelector("[data-step='1']").classList.add("complete");
        document.querySelector("[data-step='2']").classList.add("active");
        showToast("Both forms are ready. You can now preview the table-selection workflow.");
    }
}

function markFormChanged(prefix) {
    if (!state[`${prefix}Validated`]) return;
    state[`${prefix}Validated`] = false;
    const feedback = document.querySelector(`#${prefix}Feedback`);
    const badge = document.querySelector(`#${prefix}State`);
    feedback.textContent = "Details changed. Validate the form again.";
    feedback.style.color = "var(--warning)";
    badge.textContent = "Changed";
    badge.className = "connection-state neutral";
    elements.loadTablesButton.disabled = true;
}

function unlockTablePreview() {
    state.tablesLoaded = true;
    elements.tablesOverlay.classList.add("is-hidden");
    elements.tableSearch.disabled = false;
    elements.selectAllTables.disabled = false;
    elements.clearSelection.disabled = false;
    elements.tablePageSize.disabled = false;
    document.querySelectorAll(".table-checkbox, .inline-action").forEach((control) => {
        control.disabled = false;
    });
    elements.comparisonMode.disabled = false;
    elements.batchSize.disabled = false;
    renderTablePage();
    document.querySelector("[data-step='2']").classList.add("active");
    addLog("INFO", "Loaded representative Phase 1 table data for UI preview.");
    showToast("Table workspace unlocked with preview data.");
    document.querySelector("#tablesSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function matchingRows() {
    const query = elements.tableSearch.value.trim().toLowerCase();
    return [...document.querySelectorAll("#tablesTable tbody tr")]
        .filter((row) => row.dataset.name.includes(query));
}

function matchingCheckboxes() {
    return matchingRows().map((row) => row.querySelector(".table-checkbox"));
}

function renderTablePage() {
    const allRows = [...document.querySelectorAll("#tablesTable tbody tr")];
    const rows = matchingRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / state.tablePageSize));
    state.tablePage = Math.min(Math.max(1, state.tablePage), totalPages);

    const startIndex = (state.tablePage - 1) * state.tablePageSize;
    const endIndex = Math.min(startIndex + state.tablePageSize, rows.length);
    const visibleRows = new Set(rows.slice(startIndex, endIndex));

    allRows.forEach((row) => {
        row.hidden = !visibleRows.has(row);
    });

    elements.tablePageRange.textContent = rows.length
        ? `${startIndex + 1}–${endIndex} of ${rows.length} tables`
        : "0 of 0 tables";
    elements.tablePageStatus.textContent = `Page ${state.tablePage} of ${totalPages}`;
    elements.previousTablePage.disabled = !state.tablesLoaded || state.tablePage === 1;
    elements.nextTablePage.disabled = !state.tablesLoaded || state.tablePage === totalPages;
    updateSelectionCount();
}

function updateSelectionCount() {
    const all = [...document.querySelectorAll(".table-checkbox")];
    const checked = all.filter((checkbox) => checkbox.checked);
    const matching = matchingCheckboxes();
    const checkedMatching = matching.filter((checkbox) => checkbox.checked);
    elements.selectionCount.textContent = `${checked.length} of ${all.length} selected`;
    elements.selectedSummary.textContent = String(checked.length);
    elements.startCompare.disabled = checked.length === 0;
    elements.selectAllTables.checked = matching.length > 0 && checkedMatching.length === matching.length;
    elements.selectAllTables.indeterminate = checkedMatching.length > 0 && checkedMatching.length < matching.length;
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
});

elements.sqlForm.addEventListener("submit", (event) => {
    event.preventDefault();
    validateConnectionForm(elements.sqlForm, "sql");
});

elements.pgForm.addEventListener("submit", (event) => {
    event.preventDefault();
    validateConnectionForm(elements.pgForm, "pg");
});

elements.sqlForm.addEventListener("input", () => markFormChanged("sql"));
elements.pgForm.addEventListener("input", () => markFormChanged("pg"));

document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
        const field = button.previousElementSibling;
        const show = field.type === "password";
        field.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute("aria-label", `${show ? "Hide" : "Show"} password`);
    });
});

elements.loadTablesButton.addEventListener("click", unlockTablePreview);

elements.tableSearch.addEventListener("input", () => {
    state.tablePage = 1;
    renderTablePage();
});

elements.selectAllTables.addEventListener("change", () => {
    matchingCheckboxes().forEach((checkbox) => {
        checkbox.checked = elements.selectAllTables.checked;
    });
    updateSelectionCount();
});

elements.tablePageSize.addEventListener("change", () => {
    state.tablePageSize = Number(elements.tablePageSize.value);
    state.tablePage = 1;
    renderTablePage();
});

elements.previousTablePage.addEventListener("click", () => {
    if (state.tablePage <= 1) return;
    state.tablePage -= 1;
    renderTablePage();
});

elements.nextTablePage.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(matchingRows().length / state.tablePageSize));
    if (state.tablePage >= totalPages) return;
    state.tablePage += 1;
    renderTablePage();
});

elements.clearSelection.addEventListener("click", () => {
    document.querySelectorAll(".table-checkbox").forEach((checkbox) => {
        checkbox.checked = false;
    });
    updateSelectionCount();
});

document.querySelectorAll(".table-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", updateSelectionCount);
});

document.querySelectorAll(".inline-action").forEach((button) => {
    button.addEventListener("click", () => showToast("Manual key selection will be implemented with schema comparison in Phase 3."));
});

elements.startCompare.addEventListener("click", () => {
    showToast("The comparison engine will be connected in later phases. This milestone verifies the UI workflow.");
    addLog("INFO", "Start comparison requested from the Phase 1 UI shell.");
});

elements.resultsTab.addEventListener("click", () => activateTab("results"));
elements.logTab.addEventListener("click", () => activateTab("log"));

document.querySelector("#copyLog").addEventListener("click", async () => {
    const text = elements.logWindow.innerText;
    try {
        await navigator.clipboard.writeText(text);
        showToast("Execution log copied.");
    } catch {
        showToast("Clipboard access is unavailable in this browser.");
    }
});

document.querySelector("#themeInfo").addEventListener("click", () => {
    showToast("Phase 1 · Modern UI shell · No database calls are made yet.");
});

document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "1") activateTab("results");
    if (event.altKey && event.key === "2") activateTab("log");
});

renderTablePage();
