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
    comparisonPromise: null,
    lastRunDurationSeconds: 0,
    profiles: [],
    currentProfileId: "",
    profileDirty: false,
    applyingProfile: false,
    pendingProfileSelection: new Set(),
    tableSets: [],
    currentTableSetId: "",
    tableSetDirty: false,
    applyingTableSet: false,
    pendingReconciliation: null,
    backendOffline: false,
    runProcessedRows: 0,
    currentTableProcessedRows: 0,
    discoveredRowPositions: 0,
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
    firstTablePage: document.querySelector("#firstTablePage"),
    previousTablePage: document.querySelector("#previousTablePage"),
    nextTablePage: document.querySelector("#nextTablePage"),
    lastTablePage: document.querySelector("#lastTablePage"),
    tablePageInput: document.querySelector("#tablePageInput"),
    selectedSummary: document.querySelector("#selectedSummary"),
    estimatedWork: document.querySelector("#estimatedWork"),
    comparisonVolume: document.querySelector("#comparisonVolume"),
    comparisonMode: document.querySelector("#comparisonMode"),
    selectedModeSummary: document.querySelector("#selectedModeSummary"),
    batchSize: document.querySelector("#batchSize"),
    ignoreTrailingSpaces: document.querySelector("#ignoreTrailingSpaces"),
    caseSensitiveText: document.querySelector("#caseSensitiveText"),
    decimalTolerance: document.querySelector("#decimalTolerance"),
    timestampTolerance: document.querySelector("#timestampTolerance"),
    startCompareButtons: [...document.querySelectorAll("[data-start-comparison]")],
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
    saveProfile: document.querySelector("#saveProfile"),
    deleteProfile: document.querySelector("#deleteProfile"),
    tableSetSelect: document.querySelector("#tableSetSelect"),
    tableSetType: document.querySelector("#tableSetType"),
    saveTableSet: document.querySelector("#saveTableSet"),
    deleteTableSet: document.querySelector("#deleteTableSet"),
    reconciliationDialog: document.querySelector("#reconciliationDialog"),
    reconciliationSummary: document.querySelector("#reconciliationSummary"),
    reconciliationCounts: document.querySelector("#reconciliationCounts"),
    reconciliationBody: document.querySelector("#reconciliationBody"),
    selectAllReconciliation: document.querySelector("#selectAllReconciliation"),
    closeReconciliation: document.querySelector("#closeReconciliation"),
    cancelReconciliation: document.querySelector("#cancelReconciliation"),
    applyReconciliation: document.querySelector("#applyReconciliation"),
    reportType: document.querySelector("#reportType"),
    exportReport: document.querySelector("#exportReport"),
    openDashboard: document.querySelector("#openDashboard"),
    exportLog: document.querySelector("#exportLog"),
    notificationStack: document.querySelector("#notificationStack"),
    themeToggle: document.querySelector("#themeToggle"),
    backToTop: document.querySelector("#backToTop"),
    serviceBanner: document.querySelector("#serviceBanner"),
    serviceBannerTitle: document.querySelector("#serviceBannerTitle"),
    serviceBannerMessage: document.querySelector("#serviceBannerMessage"),
    retryService: document.querySelector("#retryService"),
    tablesOverlayTitle: document.querySelector("#tablesOverlayTitle"),
    tablesOverlayMessage: document.querySelector("#tablesOverlayMessage"),
    accordionToggles: [...document.querySelectorAll(".accordion-toggle")],
    accordionHeadings: [...document.querySelectorAll(".workflow-step > .section-heading")],
    sqlPortHelp: document.querySelector("#sqlPortHelp"),
    sqlPortHelpPanel: document.querySelector("#sqlPortHelpPanel"),
    sqlPortQuery: document.querySelector("#sqlPortQuery"),
    copySqlPortQuery: document.querySelector("#copySqlPortQuery"),
};

const NOTIFICATION_DURATION_MS = 5000;

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
            localStorage.setItem("data-sync-check-theme", selected);
        } catch {
            // Theme still applies for this session when browser storage is unavailable.
        }
    }
}

function newOperationId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `operation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showToast(message, type = "info") {
    const supportedTypes = new Set(["success", "warning", "error", "info"]);
    const selectedType = supportedTypes.has(type) ? type : "info";
    const notification = document.createElement("article");
    notification.className = `notification notification-${selectedType}`;
    notification.setAttribute("role", selectedType === "error" ? "alert" : "status");

    const content = document.createElement("div");
    content.className = "notification-content";

    const statusIcon = document.createElement("span");
    statusIcon.className = "notification-status-icon";
    statusIcon.setAttribute("aria-hidden", "true");
    statusIcon.textContent = {
        success: "✓",
        warning: "!",
        error: "!",
        info: "i",
    }[selectedType];

    const messageElement = document.createElement("p");
    messageElement.className = "notification-message";
    messageElement.textContent = message;

    const closeButton = document.createElement("button");
    closeButton.className = "notification-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Dismiss notification");
    closeButton.textContent = "×";

    const progress = document.createElement("span");
    progress.className = "notification-progress";
    progress.setAttribute("aria-hidden", "true");
    progress.style.animationDuration = `${NOTIFICATION_DURATION_MS}ms`;

    content.append(statusIcon, messageElement, closeButton);
    notification.append(content, progress);
    elements.notificationStack.append(notification);

    let timer;
    const dismiss = () => {
        window.clearTimeout(timer);
        notification.classList.add("is-leaving");
        window.setTimeout(() => notification.remove(), 180);
    };
    closeButton.addEventListener("click", dismiss);
    window.requestAnimationFrame(() => notification.classList.add("is-visible"));
    timer = window.setTimeout(dismiss, NOTIFICATION_DURATION_MS);
}

function setAccordion(step, expanded, { scroll = false } = {}) {
    const panel = document.querySelector(`[data-step-panel="${step}"]`);
    const toggle = document.querySelector(`[data-accordion-step="${step}"]`);
    if (!panel || !toggle) return;
    panel.classList.toggle("is-collapsed", !expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.querySelector(".accordion-label").textContent = expanded ? "Collapse" : "Expand";
    if (expanded && scroll) {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function openWorkflowStep(step, { collapseEarlier = false, scroll = false } = {}) {
    if (collapseEarlier) {
        for (let prior = 1; prior < step; prior += 1) setAccordion(prior, false);
    }
    setAccordion(step, true, { scroll });
}

function timestamp() {
    return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function showServiceBanner(kind, title, message) {
    elements.serviceBanner.classList.remove("checking", "ready", "offline", "restored");
    elements.serviceBanner.classList.add(kind);
    elements.serviceBannerTitle.textContent = title;
    elements.serviceBannerMessage.textContent = message;
    elements.serviceBanner.setAttribute(
        "aria-label",
        `Local service status: ${message}`,
    );
    elements.serviceBanner.setAttribute("aria-live", kind === "offline" ? "assertive" : "polite");
    elements.serviceBanner.title = kind === "offline"
        ? "Restart run.bat, then use refresh and retest both database connections."
        : "The local Data Sync Check service is running.";
}

function markBackendOffline() {
    if (state.backendOffline) return;
    state.backendOffline = true;
    state.sqlValidated = false;
    state.pgValidated = false;
    state.sqlSignature = "";
    state.pgSignature = "";
    state.catalogToken = "";
    state.tablesLoaded = false;
    state.currentMatchingIds = [];
    state.selectedTables.clear();
    state.manualKeys.clear();
    elements.tableSetSelect.value = "";
    state.currentTableSetId = "";
    state.tableSetDirty = false;
    state.tableRequestController?.abort();
    state.compareController?.abort();
    state.comparing = false;
    state.stopRequested = true;
    state.stopMode = "immediate";
    state.activeDataJobId = null;
    state.activeOperationId = "";
    window.clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
    [
        elements.loadTablesButton,
        ...elements.startCompareButtons,
        elements.stopCompare,
        elements.stopNow,
        elements.tableSearch,
        elements.clearTableSearch,
        ...elements.tableStatusFilters,
        elements.selectAllTables,
        elements.clearSelection,
        elements.tablePageSize,
    ].forEach((control) => { control.disabled = true; });
    ["sql", "pg"].forEach((prefix) => {
        const feedback = document.querySelector(`#${prefix}Feedback`);
        const badge = document.querySelector(`#${prefix}State`);
        feedback.textContent = "Local service stopped. Restart run.bat and test this connection again.";
        feedback.className = "form-feedback error";
        badge.textContent = "Service offline";
        badge.className = "connection-state error";
    });
    elements.tablesOverlay.classList.remove("is-hidden");
    elements.tablesOverlayTitle.textContent = "Local service is unavailable";
    elements.tablesOverlayMessage.textContent =
        "Restart run.bat, confirm the service is restored, then retest both connections.";
    elements.progressTitle.textContent = "Comparison service stopped";
    elements.progressStatus.textContent =
        "Completed results remain visible. Restart run.bat before starting another operation.";
    showServiceBanner(
        "offline",
        "Local service",
        "Unavailable",
    );
    updateSelectionCount();
    updatePagination();
    addLog("WARN", "Local application service became unavailable. Connection states were invalidated.");
}

function markBackendReachable() {
    if (!state.backendOffline) return;
    state.backendOffline = false;
    showServiceBanner(
        "restored",
        "Local service",
        "Running · retest connections",
    );
    elements.tablesOverlayTitle.textContent = "Retest both database connections";
    elements.tablesOverlayMessage.textContent =
        "Connection verification is required after the local service restarts.";
}

async function checkBackendHealth() {
    elements.retryService.disabled = true;
    elements.retryService.classList.add("is-checking");
    try {
        await requestJson("/api/health", { method: "GET" });
        if (state.sqlValidated && state.pgValidated) {
            showServiceBanner(
                "ready",
                "Local service",
                "Running",
            );
        } else if (!state.backendOffline) {
            showServiceBanner(
                "ready",
                "Local service",
                "Running · connections pending",
            );
        }
    } catch {
        // requestJson displays the persistent offline recovery state.
    } finally {
        elements.retryService.disabled = false;
        elements.retryService.classList.remove("is-checking");
    }
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
    feedback.className = `form-feedback ${kind}`;
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
    elements.deleteProfile.disabled = !selected || state.comparing;
    elements.saveProfile.disabled = state.comparing;
    elements.saveProfile.classList.toggle("is-dirty", selected && state.profileDirty);
    const profileName = elements.profileSelect.selectedOptions[0]?.text || "profile";
    elements.saveProfile.setAttribute(
        "aria-label",
        selected ? `Save changes to ${profileName}` : "Save new profile",
    );
    elements.saveProfile.title = selected
        ? (state.profileDirty ? "Save profile changes" : "Save current profile")
        : "Save as a new profile";
}

function tableSetContext() {
    const sqlserver = connectionConfigWithoutPassword("sql");
    const postgres = connectionConfigWithoutPassword("pg");
    return {
        sqlserver: {
            server: sqlserver.server || "",
            port: sqlserver.port || "",
            database: sqlserver.database || "",
            schema: sqlserver.schema || "dbo",
        },
        postgres: {
            host: postgres.host || "",
            port: postgres.port || "",
            database: postgres.database || "",
            schema: postgres.schema || "public",
        },
    };
}

function tableSetContextSignature(context) {
    const sqlserver = context?.sqlserver || {};
    const postgres = context?.postgres || {};
    return JSON.stringify([
        sqlserver.server,
        sqlserver.port,
        sqlserver.database,
        sqlserver.schema || "dbo",
        postgres.host,
        postgres.port,
        postgres.database,
        postgres.schema || "public",
    ].map((value) => String(value || "").trim().toLocaleLowerCase()));
}

function tableSetPayload(name, id = "") {
    const selectedManualKeys = {};
    state.selectedTables.forEach((tableId) => {
        if (state.manualKeys.has(tableId)) {
            selectedManualKeys[tableId] = state.manualKeys.get(tableId);
        }
    });
    return {
        id,
        name,
        selection_type: elements.tableSetType.value,
        context: tableSetContext(),
        selected_tables: [...state.selectedTables],
        manual_keys: selectedManualKeys,
        comparison_mode: elements.comparisonMode.value,
        batch_size: Number(elements.batchSize.value),
    };
}

async function refreshTableSets(selectId = "") {
    try {
        const result = await requestJson("/api/table-sets", { method: "GET" });
        state.tableSets = result.table_sets || [];
        elements.tableSetSelect.replaceChildren(
            new Option("No saved table selection", ""),
        );
        state.tableSets.forEach((tableSet) => {
            const count = tableSet.selected_tables?.length || 0;
            const type = tableSet.selection_type === "portable" ? "Reusable" : "Connection";
            elements.tableSetSelect.add(
                new Option(
                    `${tableSet.name} · ${type} · ${count} table${count === 1 ? "" : "s"}`,
                    tableSet.id,
                ),
            );
        });
        elements.tableSetSelect.value = selectId
            && state.tableSets.some((tableSet) => tableSet.id === selectId)
            ? selectId
            : "";
        state.currentTableSetId = elements.tableSetSelect.value;
        if (!state.currentTableSetId) {
            elements.tableSetType.value = "portable";
        }
        updateTableSetButtons();
    } catch (error) {
        addLog("WARN", error.message);
    }
}

function updateTableSetButtons() {
    const selected = Boolean(elements.tableSetSelect.value);
    const workspaceReady = state.tablesLoaded && !state.backendOffline;
    elements.tableSetSelect.disabled = !workspaceReady || state.comparing;
    elements.tableSetType.disabled = !workspaceReady || state.comparing;
    elements.saveTableSet.disabled =
        !workspaceReady || !state.selectedTables.size || state.comparing;
    elements.deleteTableSet.disabled = !workspaceReady || !selected || state.comparing;
    elements.saveTableSet.classList.toggle(
        "is-dirty",
        selected && state.tableSetDirty,
    );
    const tableSetName =
        elements.tableSetSelect.selectedOptions[0]?.text?.split(" · ")[0]
        || "table selection";
    elements.saveTableSet.setAttribute(
        "aria-label",
        selected ? `Save changes to ${tableSetName}` : "Save named table selection",
    );
    elements.saveTableSet.title = selected
        ? (state.tableSetDirty ? "Save table selection changes" : "Save current table selection")
        : "Save as a named table selection";
}

async function applyTableSet(tableSet) {
    if (tableSet.selection_type === "portable") {
        const response = await requestJson(
            `/api/table-sets/${tableSet.id}/reconcile`,
            {
                method: "POST",
                body: JSON.stringify({ catalog_token: state.catalogToken }),
            },
        );
        const reconciliation = response.reconciliation;
        const selected = await showReconciliationPreview(reconciliation);
        if (!selected) {
            elements.tableSetSelect.value = "";
            state.currentTableSetId = "";
            updateTableSetButtons();
            return;
        }
        applyResolvedTableSet(
            tableSet,
            selected.tableIds,
            selected.manualKeys,
        );
        const skipped = reconciliation.entries.length
            - selected.tableIds.length;
        showToast(
            skipped
                ? `${selected.tableIds.length} selected table(s) applied; ${skipped} skipped.`
                : `Reusable Tables Selection "${tableSet.name}" applied.`,
            skipped ? "warning" : "success",
        );
        return;
    }
    if (
        tableSetContextSignature(tableSet.context)
        !== tableSetContextSignature(tableSetContext())
    ) {
        elements.tableSetSelect.value = "";
        state.currentTableSetId = "";
        updateTableSetButtons();
        showToast(
            "This table selection belongs to different database or schema details.",
            "warning",
        );
        return;
    }

    applyResolvedTableSet(
        tableSet,
        tableSet.selected_tables || [],
        tableSet.manual_keys || {},
    );
    showToast(`Table selection "${tableSet.name}" applied.`, "success");
}

function applyResolvedTableSet(tableSet, selectedTables, manualKeys) {
    state.applyingTableSet = true;
    state.selectedTables = new Set(selectedTables);
    state.manualKeys = new Map(Object.entries(manualKeys));
    state.currentTableSetId = tableSet.id;
    state.tableSetDirty = false;
    elements.tableSetType.value = tableSet.selection_type || "connection_specific";
    elements.comparisonMode.value = tableSet.comparison_mode || elements.comparisonMode.value;
    elements.batchSize.value = String(tableSet.batch_size || elements.batchSize.value);
    elements.tablesBody.querySelectorAll("tr[data-id]").forEach((row) => {
        const tableId = row.dataset.id;
        const checkbox = row.querySelector(".table-checkbox");
        const keyInput = row.querySelector(".key-input");
        const keyHint = row.querySelector(".key-hint");
        checkbox.checked = state.selectedTables.has(tableId);
        const manualKey = state.manualKeys.get(tableId) || [];
        keyInput.value = manualKey.join(", ");
        if (manualKey.length) {
            keyHint.textContent = `Manual: ${manualKey.join(", ")}`;
            keyHint.classList.remove("muted-value");
        }
    });
    updateSelectionCount();
    state.applyingTableSet = false;
    updateTableSetButtons();
    addLog(
        "INFO",
        `Loaded table selection "${tableSet.name}" with ${state.selectedTables.size} table(s).`,
    );
    updateEstimatedWork();
}

function showReconciliationPreview(reconciliation) {
    state.pendingReconciliation = reconciliation;
    const labels = {
        available_in_both: "Available in both",
        sqlserver_only: "SQL Server only",
        postgres_only: "PostgreSQL only",
        missing: "Missing",
        ambiguous: "Ambiguous",
    };
    elements.reconciliationSummary.textContent =
        `"${reconciliation.name}" was checked against the currently loaded databases.`;
    elements.reconciliationCounts.replaceChildren();
    Object.entries(labels).forEach(([status, label]) => {
        const count = reconciliation.counts[status] || 0;
        const chip = document.createElement("span");
        chip.className = "reconciliation-count";
        chip.textContent = `${label}: ${count}`;
        elements.reconciliationCounts.append(chip);
    });
    elements.reconciliationBody.replaceChildren();
    reconciliation.entries.forEach((entry) => {
        const row = document.createElement("tr");
        const selectable = [
            "available_in_both",
            "sqlserver_only",
            "postgres_only",
        ].includes(entry.status) && Boolean(entry.resolved_id);
        const selectedByDefault = entry.status === "available_in_both";
        const sqlName = entry.sqlserver || "—";
        const pgName = entry.postgres || "—";
        const detail = entry.status === "ambiguous" && entry.candidates?.length
            ? `${labels[entry.status]}: ${entry.candidates.join(", ")}`
            : labels[entry.status];
        row.innerHTML = `
            <td class="reconciliation-select-cell">
                <input class="reconciliation-checkbox" type="checkbox">
            </td>
            <td><strong></strong></td>
            <td></td>
            <td></td>
            <td><span class="reconciliation-status ${entry.status}"></span></td>`;
        const checkbox = row.querySelector(".reconciliation-checkbox");
        checkbox.checked = selectable && selectedByDefault;
        checkbox.disabled = !selectable;
        checkbox.dataset.tableId = entry.resolved_id || "";
        checkbox.setAttribute(
            "aria-label",
            selectable
                ? `Select ${entry.requested_id}`
                : `${entry.requested_id} cannot be resolved in the current databases`,
        );
        row.classList.toggle("reconciliation-row-unavailable", !selectable);
        row.children[1].querySelector("strong").textContent = entry.requested_id;
        row.children[2].textContent = sqlName;
        row.children[3].textContent = pgName;
        row.children[4].querySelector("span").textContent = detail;
        elements.reconciliationBody.append(row);
    });

    const selectableCheckboxes = () => [
        ...elements.reconciliationBody.querySelectorAll(
            ".reconciliation-checkbox:not(:disabled)",
        ),
    ];
    const selectedTables = () => selectableCheckboxes()
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.dataset.tableId);
    const updateReconciliationSelection = () => {
        const checkboxes = selectableCheckboxes();
        const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
        elements.selectAllReconciliation.disabled = !checkboxes.length;
        elements.selectAllReconciliation.checked =
            Boolean(checkboxes.length) && selectedCount === checkboxes.length;
        elements.selectAllReconciliation.indeterminate =
            selectedCount > 0 && selectedCount < checkboxes.length;
        elements.applyReconciliation.disabled = selectedCount === 0;
        elements.applyReconciliation.textContent =
            `Apply ${selectedCount} selected table${selectedCount === 1 ? "" : "s"}`;
    };
    selectableCheckboxes().forEach((checkbox) => {
        checkbox.addEventListener("change", updateReconciliationSelection);
    });
    elements.selectAllReconciliation.onchange = () => {
        const checked = elements.selectAllReconciliation.checked;
        selectableCheckboxes().forEach((checkbox) => {
            checkbox.checked = checked;
        });
        updateReconciliationSelection();
    };
    updateReconciliationSelection();
    elements.reconciliationDialog.showModal();
    return new Promise((resolve) => {
        const finish = (accepted) => {
            const tableIds = accepted ? selectedTables() : [];
            const manualKeys = {};
            tableIds.forEach((tableId) => {
                const keys = reconciliation.applicable_manual_keys?.[tableId];
                if (keys?.length) manualKeys[tableId] = keys;
            });
            elements.reconciliationDialog.close();
            state.pendingReconciliation = null;
            resolve(accepted ? { tableIds, manualKeys } : null);
        };
        elements.applyReconciliation.onclick = () => finish(true);
        elements.cancelReconciliation.onclick = () => finish(false);
        elements.closeReconciliation.onclick = () => finish(false);
        elements.reconciliationDialog.oncancel = (event) => {
            event.preventDefault();
            finish(false);
        };
    });
}

function markTableSetDirty() {
    if (state.applyingTableSet || !elements.tableSetSelect.value) return;
    state.tableSetDirty = true;
    updateTableSetButtons();
}

function clearCurrentTableSelection({ clearSavedSet = false } = {}) {
    state.selectedTables.clear();
    state.manualKeys.clear();
    currentCheckboxes().forEach((checkbox) => {
        const row = checkbox.closest("tr");
        checkbox.checked = false;
        const keyInput = row?.querySelector(".key-input");
        const keyHint = row?.querySelector(".key-hint");
        if (keyInput) keyInput.value = "";
        if (keyHint) {
            keyHint.textContent = "Leave blank for automatic detection";
            keyHint.classList.add("muted-value");
        }
    });
    if (clearSavedSet) {
        state.currentTableSetId = "";
        state.tableSetDirty = false;
        elements.tableSetType.value = "portable";
    } else {
        markTableSetDirty();
    }
    markProfileDirty();
    updateSelectionCount();
}

function applyProfile(profile) {
    state.applyingProfile = true;
    const savedManualKeys = new Map(Object.entries(profile.manual_keys || {}));
    elements.sqlForm.reset();
    elements.pgForm.reset();
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
    state.profileDirty = false;
    elements.tableSetSelect.value = "";
    state.currentTableSetId = "";
    state.tableSetDirty = false;
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
        feedback.className = "form-feedback neutral";
    });
    elements.loadTablesButton.disabled = true;
    lockTables();
    state.manualKeys = savedManualKeys;
    state.applyingProfile = false;
    updateProfileButtons();
    updateEstimatedWork();
    addLog("INFO", `Loaded profile "${profile.name}". Passwords must be entered again.`);
    showToast(`Profile loaded. Enter passwords and retest both connections.`);
}

function resetProfileDefaults() {
    state.applyingProfile = true;
    elements.sqlForm.reset();
    elements.pgForm.reset();
    elements.sqlAuthentication.dispatchEvent(new Event("change"));
    document.querySelectorAll(".connection-more-options").forEach((details) => {
        details.open = false;
    });
    elements.tableStatusFilters.forEach((checkbox) => {
        checkbox.checked = checkbox.value === "available";
    });
    elements.comparisonMode.value = "full";
    elements.batchSize.value = "5000";
    elements.ignoreTrailingSpaces.checked = false;
    elements.caseSensitiveText.checked = true;
    elements.decimalTolerance.value = "0";
    elements.timestampTolerance.value = "0";
    elements.tableSearch.value = "";
    elements.tablePageSize.value = "10";
    state.tablePage = 1;
    state.tablePageSize = 10;
    state.currentProfileId = "";
    state.profileDirty = false;
    elements.tableSetSelect.value = "";
    state.currentTableSetId = "";
    state.tableSetDirty = false;
    state.pendingProfileSelection.clear();
    state.sqlValidated = false;
    state.pgValidated = false;
    state.sqlSignature = "";
    state.pgSignature = "";
    ["sql", "pg"].forEach((prefix) => {
        const badge = document.querySelector(`#${prefix}State`);
        const feedback = document.querySelector(`#${prefix}Feedback`);
        badge.textContent = "Not tested";
        badge.className = "connection-state neutral";
        feedback.textContent = "";
        feedback.className = "form-feedback neutral";
    });
    elements.loadTablesButton.disabled = true;
    lockTables();
    state.applyingProfile = false;
    updateProfileButtons();
    updateEstimatedWork();
    setAccordion(1, true);
    setAccordion(2, false);
    setAccordion(3, false);
    addLog("INFO", "Profile selection cleared. Default settings restored.");
    showToast("Default settings restored.");
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
    let response;
    try {
        response = await fetch(url, {
            ...options,
            cache: "no-store",
            headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        });
    } catch (error) {
        if (error.name === "AbortError") throw error;
        markBackendOffline();
        throw new Error(
            "The local application service is unavailable. Start run.bat, then retest both connections.",
        );
    }
    markBackendReachable();
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
        const successMessage = prefix === "sql"
            ? "SQL Server connection verified successfully."
            : "PostgreSQL connection verified successfully.";
        showFeedback(prefix, successMessage, "success");
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
        button.lastChild.textContent = prefix === "sql"
            ? " Test SQL Connection"
            : " Test PGSQL Connection";
    }
}

function updateConnectionState() {
    const bothValidated = state.sqlValidated && state.pgValidated;
    elements.loadTablesButton.disabled = !bothValidated;
    if (bothValidated) {
        document.querySelector("[data-step='1']").classList.add("complete");
        document.querySelector("[data-step='2']").classList.add("active");
        showServiceBanner("ready", "Local service", "Running");
        showToast("Both database connections succeeded. You can now load tables.", "success");
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
    feedback.className = "form-feedback warning";
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
    elements.tableSetSelect.value = "";
    state.currentTableSetId = "";
    state.tableSetDirty = false;
    state.schemaResults.clear();
    resetSchemaResults();
    elements.tablesOverlay.classList.remove("is-hidden");
    elements.tablesOverlayTitle.textContent = "Connect both databases to load tables";
    elements.tablesOverlayMessage.textContent =
        "Live table discovery becomes available after both connection tests pass.";
    [
        elements.tableSearch,
        elements.clearTableSearch,
        ...elements.tableStatusFilters,
        elements.selectAllTables,
        elements.clearSelection,
        elements.tablePageSize,
        elements.tablePageInput,
    ]
        .forEach((control) => { control.disabled = true; });
    elements.comparisonMode.disabled = true;
    elements.tableSetSelect.disabled = true;
    elements.tableSetType.disabled = true;
    elements.tablesBody.replaceChildren();
    updateSelectionCount();
    updatePagination();
    updateTableSetButtons();
}

function unlockTableWorkspace() {
    state.tablesLoaded = true;
    elements.tablesOverlay.classList.add("is-hidden");
    [
        elements.tableSearch,
        elements.clearTableSearch,
        ...elements.tableStatusFilters,
        elements.selectAllTables,
        elements.clearSelection,
        elements.tablePageSize,
        elements.tablePageInput,
    ]
        .forEach((control) => { control.disabled = false; });
    elements.comparisonMode.disabled = false;
    elements.batchSize.disabled = elements.comparisonMode.value !== "full";
    document.querySelector("[data-step='2']").classList.add("complete");
    document.querySelector("[data-step='3']").classList.add("active");
    updateTableSetButtons();
}

function activeTableStatuses() {
    return elements.tableStatusFilters
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value);
}

async function loadTables({ resetPage = false, scroll = false, refreshCatalog = false } = {}) {
    if (!state.sqlValidated || !state.pgValidated) {
        showToast("Test both connections again before loading tables.", "warning");
        return;
    }
        if (refreshCatalog) {
        state.catalogToken = "";
        state.currentMatchingIds = [];
        state.selectedTables.clear();
        elements.tableSetSelect.value = "";
        state.currentTableSetId = "";
        state.tableSetDirty = false;
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
        openWorkflowStep(2, { collapseEarlier: true, scroll });
        addLog("INFO", `Showing ${result.tables.length} of ${state.tableTotal} filtered table names.`);
    } catch (error) {
        if (error.name === "AbortError") return;
        addLog("WARN", error.message);
        showToast(error.message, "error");
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
            markProfileDirty();
            markTableSetDirty();
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
            markProfileDirty();
            markTableSetDirty();
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
    elements.startCompareButtons.forEach((button) => {
        button.disabled = selectedCount === 0 || state.comparing;
    });
    elements.selectAllTables.checked = state.currentMatchingIds.length > 0
        && selectedMatchingCount === state.currentMatchingIds.length;
    elements.selectAllTables.indeterminate = selectedMatchingCount > 0
        && selectedMatchingCount < state.currentMatchingIds.length;
    updateTableSetButtons();
}

function updateEstimatedWork() {
    const selectedCount = state.selectedTables.size;
    const mode = elements.comparisonMode.value;
    elements.selectedModeSummary.textContent =
        elements.comparisonMode.selectedOptions[0]?.text || "Schema + Row Count + Data";
    elements.estimatedWork.textContent = selectedCount
        ? mode === "full"
            ? `${selectedCount * 3} checks across ${selectedCount} table${selectedCount === 1 ? "" : "s"}`
            : mode === "schema_and_counts"
                ? `${selectedCount * 2} checks across ${selectedCount} table${selectedCount === 1 ? "" : "s"}`
                : `${selectedCount} schema check${selectedCount === 1 ? "" : "s"}`
        : "Waiting for tables";
    if (!state.comparing) {
        elements.comparisonVolume.textContent = selectedCount
            ? mode === "full"
                ? `Batch size ${formatCount(Number(elements.batchSize.value))}; total calculated during run`
                : mode === "schema_and_counts"
                    ? "Exact row counts calculated during run"
                    : "Schema metadata only"
            : "Not calculated";
    }
}

function updateComparisonVolume() {
    const mode = elements.comparisonMode.value;
    if (mode === "schema_only") {
        elements.comparisonVolume.textContent = "Schema metadata only";
        return;
    }
    if (!state.discoveredRowPositions) {
        elements.comparisonVolume.textContent = state.comparing
            ? "Calculating row volume…"
            : "Exact row counts calculated during run";
        return;
    }
    if (mode === "schema_and_counts") {
        elements.comparisonVolume.textContent =
            `${formatCount(state.discoveredRowPositions)} row positions counted`;
        return;
    }
    const processed = state.runProcessedRows + state.currentTableProcessedRows;
    elements.comparisonVolume.textContent =
        `${formatCount(processed)} / ${formatCount(state.discoveredRowPositions)} row positions`;
}

function updatePagination() {
    const start = state.tableTotal ? (state.tablePage - 1) * state.tablePageSize + 1 : 0;
    const end = Math.min(state.tablePage * state.tablePageSize, state.tableTotal);
    elements.tablePageRange.textContent = `${start}${state.tableTotal ? `–${end}` : ""} of ${state.tableTotal} tables`;
    elements.tablePageInput.value = String(state.tablePage);
    elements.tablePageInput.max = String(state.tableTotalPages);
    elements.tablePageStatus.textContent = `of ${state.tableTotalPages}`;
    elements.firstTablePage.disabled = !state.tablesLoaded || state.tablePage === 1;
    elements.previousTablePage.disabled = !state.tablesLoaded || state.tablePage === 1;
    elements.nextTablePage.disabled = !state.tablesLoaded || state.tablePage >= state.tableTotalPages;
    elements.lastTablePage.disabled =
        !state.tablesLoaded || state.tablePage >= state.tableTotalPages;
    elements.tablePageInput.disabled = !state.tablesLoaded;
}

function goToTablePage(page) {
    if (!state.tablesLoaded) return;
    const target = Math.min(
        state.tableTotalPages,
        Math.max(1, Number.parseInt(page, 10) || state.tablePage),
    );
    elements.tablePageInput.value = String(target);
    if (target === state.tablePage) return;
    state.tablePage = target;
    loadTables();
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

function resultCheckBadges(result) {
    const schemaLabel = result.status === "match"
        ? ["Schema match", "ready"]
        : result.status === "error"
            ? ["Schema error", "warning"]
            : result.status === "missing_table"
                ? ["Schema unavailable", "warning"]
                : ["Schema mismatch", "warning"];
    const countLabel = result.row_counts?.status === "match"
        ? ["Count match", "ready"]
        : result.row_counts
            ? ["Count difference", "warning"]
            : ["Count not run", "warning"];
    const dataLabel = result.data_result?.status === "match"
        ? ["Data match", "ready"]
        : result.data_result?.status === "different"
            ? ["Data difference", "warning"]
            : result.data_result?.status === "cancelled"
                ? ["Data safe-stopped", "warning"]
                : result.data_result?.status === "stopped_immediately"
                    ? ["Data stopped", "warning"]
                    : ["Data not run", "warning"];
    return [schemaLabel, countLabel, dataLabel];
}

function appendSchemaResult(tableId, result) {
    elements.resultsEmpty.classList.add("is-hidden");
    elements.resultsTable.classList.remove("is-hidden");
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
    const statusStack = document.createElement("div");
    statusStack.className = "result-status-stack";
    resultCheckBadges(result).forEach(([label, kind]) => {
        const chip = document.createElement("span");
        chip.className = `status-chip result-check-badge ${kind}`;
        chip.textContent = label;
        statusStack.append(chip);
    });
    statusCell.append(statusStack);

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
    if (result.status !== "error" && result.status !== "missing_table") {
        const schemaSummary = document.createElement("div");
        schemaSummary.className = `schema-verdict ${result.status === "match" ? "is-match" : "is-mismatch"}`;
        const verdict = document.createElement("strong");
        verdict.textContent = result.status === "match" ? "Schema Match" : "Schema Mismatch";
        const explanation = document.createElement("span");
        explanation.textContent = (result.summary || "").replace(
            /^Schema (?:Match|Mismatch)\s*—\s*/,
            "",
        );
        schemaSummary.append(verdict, explanation);
        wrap.append(schemaSummary);
    }
    if (result.columns?.length) {
        const heading = document.createElement("h3");
        heading.textContent = "Column comparison";
        wrap.append(heading, buildColumnDetails(result.columns));
    }
    if (result.primary_key_status) {
        const heading = document.createElement("h3");
        heading.textContent = "Primary key comparison";
        const primaryKeySummary = document.createElement("p");
        primaryKeySummary.className = result.primary_key_status === "match"
            ? "primary-key-summary is-match"
            : "primary-key-summary is-mismatch";
        const sqlKey = result.sqlserver_primary_key?.join(", ") || "None";
        const pgKey = result.postgres_primary_key?.join(", ") || "None";
        primaryKeySummary.textContent = result.primary_key_status === "match"
            ? `Match · ${sqlKey}`
            : `Mismatch · SQL Server: ${sqlKey} · PostgreSQL: ${pgKey}`;
        wrap.append(heading, primaryKeySummary);
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
            schema_differences: (result.columns || [])
                .filter((column) => column.status !== "match")
                .map((column) => ({
                    column: column.name || "",
                    status: column.status || "",
                    sqlserver: column.sqlserver
                        ? `${column.sqlserver.type} · ${column.sqlserver.nullable ? "NULL" : "NOT NULL"}`
                        : "Missing",
                    postgres: column.postgres
                        ? `${column.postgres.type} · ${column.postgres.nullable ? "NULL" : "NOT NULL"}`
                        : "Missing",
                    expected_postgres: column.expected_postgres || "",
                    reason: column.differences?.join(", ") || "",
                })),
            primary_key_status: result.primary_key_status || "",
            sqlserver_primary_key: result.sqlserver_primary_key || [],
            postgres_primary_key: result.postgres_primary_key || [],
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
    const available = ["mismatches", "summary", "csv", "log"].some((kind) => files[kind]);
    elements.reportType.disabled = !available;
    elements.exportReport.disabled = !available;
    elements.exportLog.disabled = !files.log;
    elements.openDashboard.disabled = !files.dashboard && !state.comparing;
}

function downloadReport(kind) {
    const url = state.reportFiles[kind];
    if (!url) {
        showToast("Complete a comparison before exporting reports.", "warning");
        return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
}

function requestSafeStop(message) {
    if (!state.comparing) return;
    state.stopRequested = true;
    state.stopMode = "safe";
    elements.stopCompare.disabled = true;
    elements.progressStatus.textContent = message
        || (state.activeDataJobId
            ? "Stopping safely after the current data batch finishes…"
            : "Stopping safely after the current database query finishes…");
    if (state.activeDataJobId) {
        requestJson(`/api/data/compare/${state.activeDataJobId}/cancel`, {
            method: "POST",
            body: "{}",
        }).catch(() => {});
    }
}

async function openComparisonDashboard() {
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
        showToast("Allow pop-ups to open the comparison dashboard.", "warning");
        return;
    }
    reportWindow.document.title = "Preparing comparison dashboard";
    reportWindow.document.body.innerHTML =
        '<p style="font:16px Segoe UI,sans-serif;padding:32px;color:#334155">Preparing the latest completed results…</p>';

    if (state.comparing) {
        requestSafeStop("Preparing the dashboard after the current safe batch finishes…");
        showToast("Stopping safely, exporting completed results, and preparing the dashboard.");
        await state.comparisonPromise;
    }

    const url = state.reportFiles.dashboard;
    if (!url) {
        reportWindow.close();
        showToast("Complete at least one table before opening the dashboard.", "warning");
        return;
    }
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const themedUrl = new URL(url, window.location.origin);
    themedUrl.searchParams.set("theme", theme);
    reportWindow.location.replace(themedUrl.toString());
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
                connections: {
                    sqlserver: connectionConfigWithoutPassword("sql"),
                    postgres: connectionConfigWithoutPassword("pg"),
                },
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
        state.currentTableProcessedRows = Number(response.processed || 0);
        updateComparisonVolume();
        elements.progressStatus.textContent =
            `Comparing ${tableId}: ${formatCount(response.processed)} row positions processed. `
            + `${elements.comparisonVolume.textContent}.`;
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
        showToast("The report run could not be created. Comparison was not started.", "error");
        return;
    }
    state.comparing = true;
    elements.openDashboard.disabled = false;
    updateProfileButtons();
    updateTableSetButtons();
    state.stopRequested = false;
    state.stopMode = "";
    state.runProcessedRows = 0;
    state.currentTableProcessedRows = 0;
    state.discoveredRowPositions = 0;
    state.schemaResults.clear();
    resetSchemaResults();
    elements.startCompareButtons.forEach((button) => { button.disabled = true; });
    elements.stopCompare.disabled = false;
    elements.stopNow.disabled = false;
    elements.currentTable.textContent = "Preparing…";
    state.comparisonStartedAt = Date.now();
    window.clearInterval(state.elapsedTimer);
    updateElapsedTime();
    state.elapsedTimer = window.setInterval(updateElapsedTime, 1000);
    updateComparisonVolume();
    openWorkflowStep(3, { collapseEarlier: true, scroll: true });
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
                state.discoveredRowPositions += Math.max(
                    Number(countResult.sqlserver || 0),
                    Number(countResult.postgres || 0),
                );
                updateComparisonVolume();
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
                    state.runProcessedRows += Number(dataResult?.processed || 0);
                    state.currentTableProcessedRows = 0;
                    updateComparisonVolume();
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
            state.currentTableProcessedRows = 0;
            updateComparisonVolume();
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
    updateTableSetButtons();
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
    elements.startCompareButtons.forEach((button) => {
        button.disabled = state.selectedTables.size === 0;
    });
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
        showToast("Comparison completed, but report files could not be finalized.", "error");
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
        stopped ? "warning" : "success",
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
    markProfileDirty();
    markTableSetDirty();
    updateSelectionCount();
});
elements.tablePageSize.addEventListener("change", () => {
    state.tablePageSize = Number(elements.tablePageSize.value);
    loadTables({ resetPage: true });
});
elements.firstTablePage.addEventListener("click", () => goToTablePage(1));
elements.previousTablePage.addEventListener("click", () => {
    goToTablePage(state.tablePage - 1);
});
elements.nextTablePage.addEventListener("click", () => {
    goToTablePage(state.tablePage + 1);
});
elements.lastTablePage.addEventListener("click", () => goToTablePage(state.tableTotalPages));
elements.tablePageInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    goToTablePage(elements.tablePageInput.value);
});
elements.clearSelection.addEventListener("click", () => {
    clearCurrentTableSelection();
});
elements.comparisonMode.addEventListener("change", () => {
    elements.batchSize.disabled = elements.comparisonMode.value !== "full";
    updateEstimatedWork();
});
elements.batchSize.addEventListener("change", updateEstimatedWork);
elements.tableSetSelect.addEventListener("change", async () => {
    const tableSet = state.tableSets.find(
        (item) => item.id === elements.tableSetSelect.value,
    );
    if (!tableSet) {
        clearCurrentTableSelection({ clearSavedSet: true });
        showToast("Table selection cleared.", "info");
        return;
    }
    elements.tableSetType.value = tableSet.selection_type || "connection_specific";
    try {
        await applyTableSet(tableSet);
    } catch (error) {
        elements.tableSetSelect.value = "";
        state.currentTableSetId = "";
        updateTableSetButtons();
        addLog("WARN", error.message);
        showToast(error.message, "error");
    }
});
elements.tableSetType.addEventListener("change", markTableSetDirty);
elements.saveTableSet.addEventListener("click", async () => {
    if (!state.tablesLoaded || !state.selectedTables.size) {
        showToast("Select at least one table before saving.", "warning");
        return;
    }
    const existing = state.tableSets.find(
        (item) => item.id === elements.tableSetSelect.value,
    );
    const name = existing?.name || window.prompt("Table selection name", "");
    if (name === null) return;
    if (!name.trim()) {
        showToast("Enter a name before saving the table selection.", "warning");
        return;
    }
    try {
        const result = await requestJson("/api/table-sets", {
            method: "POST",
            body: JSON.stringify(tableSetPayload(name.trim(), existing?.id || "")),
        });
        state.currentTableSetId = result.table_set.id;
        state.tableSetDirty = false;
        await refreshTableSets(result.table_set.id);
        addLog("READY", result.message);
        showToast(result.message, "success");
    } catch (error) {
        addLog("WARN", error.message);
        showToast(error.message, "error");
    }
});
elements.deleteTableSet.addEventListener("click", async () => {
    const tableSet = state.tableSets.find(
        (item) => item.id === elements.tableSetSelect.value,
    );
    if (
        !tableSet
        || !window.confirm(`Delete saved table selection "${tableSet.name}"?`)
    ) return;
    try {
        const result = await requestJson(`/api/table-sets/${tableSet.id}`, {
            method: "DELETE",
        });
        state.currentTableSetId = "";
        state.tableSetDirty = false;
        await refreshTableSets();
        addLog("INFO", result.message);
        showToast(result.message, "success");
    } catch (error) {
        addLog("WARN", error.message);
        showToast(error.message, "error");
    }
});
elements.startCompareButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (state.comparisonPromise) return;
        state.comparisonPromise = runSchemaComparison()
            .finally(() => { state.comparisonPromise = null; });
    });
});
elements.stopCompare.addEventListener("click", () => {
    requestSafeStop();
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
elements.profileSelect.addEventListener("change", () => {
    const profile = state.profiles.find((item) => item.id === elements.profileSelect.value);
    if (profile) {
        applyProfile(profile);
        return;
    }
    resetProfileDefaults();
});
elements.saveProfile.addEventListener("click", async () => {
    const existing = state.profiles.find((item) => item.id === elements.profileSelect.value);
    const name = existing?.name || window.prompt("Profile name", "");
    if (name === null) return;
    if (!name.trim()) {
        showToast("Enter a profile name before saving.", "warning");
        return;
    }
    try {
        const result = await requestJson("/api/profiles", {
            method: "POST",
            body: JSON.stringify(profilePayload(name.trim(), existing?.id || "")),
        });
        state.currentProfileId = result.profile.id;
        state.profileDirty = false;
        await refreshProfiles(result.profile.id);
        addLog("READY", result.message);
        showToast(result.message, "success");
    } catch (error) {
        addLog("WARN", error.message);
        showToast(error.message, "error");
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
        state.profileDirty = false;
        await refreshProfiles();
        addLog("INFO", result.message);
        showToast(result.message, "success");
    } catch (error) {
        addLog("WARN", error.message);
        showToast(error.message, "error");
    }
});

function markProfileDirty(event) {
    if (state.applyingProfile || !elements.profileSelect.value) return;
    if (event?.target?.name === "password") return;
    state.profileDirty = true;
    updateProfileButtons();
}

[
    elements.sqlForm,
    elements.pgForm,
    elements.comparisonMode,
    elements.batchSize,
    elements.ignoreTrailingSpaces,
    elements.caseSensitiveText,
    elements.decimalTolerance,
    elements.timestampTolerance,
    ...elements.tableStatusFilters,
].forEach((control) => {
    control.addEventListener("input", markProfileDirty);
    control.addEventListener("change", markProfileDirty);
});
elements.exportReport.addEventListener("click", () => downloadReport(elements.reportType.value));
elements.openDashboard.addEventListener("click", openComparisonDashboard);
elements.exportLog.addEventListener("click", () => downloadReport("log"));
document.querySelector("#copyLog").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(elements.logWindow.innerText);
        showToast("Execution log copied.", "success");
    } catch {
        showToast("Clipboard access is unavailable in this browser.", "warning");
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
elements.retryService.addEventListener("click", checkBackendHealth);
elements.accordionToggles.forEach((toggle) => {
    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const step = Number(toggle.dataset.accordionStep);
        setAccordion(step, toggle.getAttribute("aria-expanded") !== "true");
    });
});
elements.accordionHeadings.forEach((heading) => {
    heading.classList.add("is-clickable");
    heading.title = "Click anywhere in this header to expand or collapse";
    heading.addEventListener("click", (event) => {
        if (event.target.closest("button, input, select, textarea, a, label, summary")) return;
        const panel = heading.closest("[data-step-panel]");
        const step = Number(panel?.dataset.stepPanel);
        const toggle = panel?.querySelector(".accordion-toggle");
        if (!step || !toggle) return;
        setAccordion(step, toggle.getAttribute("aria-expanded") !== "true");
    });
});
elements.sqlPortHelp.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = elements.sqlPortHelpPanel.hidden;
    elements.sqlPortHelpPanel.hidden = !willOpen;
    elements.sqlPortHelp.setAttribute("aria-expanded", String(willOpen));
});
elements.copySqlPortQuery.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
        await navigator.clipboard.writeText(elements.sqlPortQuery.textContent.trim());
        showToast("SQL Server port query copied.", "success");
    } catch {
        showToast("Clipboard access is unavailable. Select and copy the query manually.", "warning");
    }
});
window.addEventListener("focus", () => {
    if (state.backendOffline) checkBackendHealth();
});
window.setInterval(() => {
    if (!document.hidden) checkBackendHealth();
}, 15000);

applyTheme(document.documentElement.dataset.theme || "dark", false);
setAccordion(1, true);
setAccordion(2, false);
setAccordion(3, false);
updatePagination();
setReportExports();
refreshProfiles();
refreshTableSets();
checkBackendHealth();
