"use strict";

const runId = document.body.dataset.runId;
const elements = {
    tableFilter: document.querySelector("#tableFilter"),
    kindFilter: document.querySelector("#kindFilter"),
    search: document.querySelector("#reportSearch"),
    filters: document.querySelector("#filters"),
    clearFilters: document.querySelector("#clearFilters"),
    mismatchBody: document.querySelector("#mismatchBody"),
    empty: document.querySelector("#emptyDetails"),
    range: document.querySelector("#resultRange"),
    legend: document.querySelector("#issueLegend"),
    previous: document.querySelector("#previousPage"),
    next: document.querySelector("#nextPage"),
    pageStatus: document.querySelector("#pageStatus"),
    exportPdf: document.querySelector("#exportPdf"),
    themeToggle: document.querySelector("#reportThemeToggle"),
    printBody: document.querySelector("#printBody"),
    printScope: document.querySelector("#printScope"),
    notificationStack: document.querySelector("#notificationStack"),
    overviewFilters: [...document.querySelectorAll("[data-overview-filter]")],
    overviewRows: [...document.querySelectorAll("[data-overview-result]")],
    emptyOverview: document.querySelector("#emptyOverview"),
};
const state = { page: 1, totalPages: 1, timer: null, controller: null, facetsLoaded: false };
const NOTIFICATION_DURATION_MS = 5000;

function applyTheme(theme, persist = true) {
    const selected = theme === "dark" ? "dark" : "light";
    const dark = selected === "dark";
    document.documentElement.dataset.theme = selected;
    elements.themeToggle.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
    elements.themeToggle.querySelector(".theme-label").textContent = dark ? "Light" : "Dark";
    elements.themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} report theme`);
    if (persist) {
        try { localStorage.setItem("data-sync-check-theme", selected); } catch {}
    }
}

function valueText(value) {
    if (value === null) return "NULL";
    if (value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function issueLabel(kind) {
    return {
        different: "Value mismatch",
        sql_only: "Only in SQL Server",
        postgres_only: "Only in PostgreSQL",
    }[kind] || kind || "Difference";
}

function rowView(item) {
    const differences = Array.isArray(item.differences) ? item.differences : [];
    if (differences.length) {
        return differences.map((difference) => ({
            table: item.table_id || "—",
            kind: issueLabel(item.kind),
            key: valueText(item.key),
            detail: difference.column || "Changed value",
            sql: valueText(difference.sqlserver),
            pg: valueText(difference.postgres),
        }));
    }
    return [{
        table: item.table_id || "—",
        kind: issueLabel(item.kind),
        key: valueText(item.key),
        detail: item.kind === "sql_only"
            ? "Complete row is missing in PostgreSQL"
            : item.kind === "postgres_only"
                ? "Complete row is missing in SQL Server"
                : "Row values differ",
        sql: item.kind === "postgres_only" ? "Missing" : valueText(item.values),
        pg: item.kind === "sql_only" ? "Missing" : valueText(item.values),
    }];
}

function appendRows(body, records) {
    records.flatMap(rowView).forEach((view) => {
        const row = document.createElement("tr");
        [view.table, view.kind, view.key, view.detail, view.sql, view.pg].forEach((text, index) => {
            const cell = document.createElement("td");
            cell.textContent = text;
            if (index === 1) cell.dataset.kind = view.kind;
            row.append(cell);
        });
        body.append(row);
    });
}

function query(page = state.page, pageSize = 50) {
    const parameters = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
    });
    if (elements.tableFilter.value) parameters.set("table", elements.tableFilter.value);
    if (elements.kindFilter.value) parameters.set("kind", elements.kindFilter.value);
    if (elements.search.value.trim()) parameters.set("search", elements.search.value.trim());
    return `/api/reports/${encodeURIComponent(runId)}/dashboard-data?${parameters}`;
}

async function loadAllFilteredMismatchRows() {
    const pageSize = 1000;
    const firstResponse = await fetch(query(1, pageSize), { cache: "no-store" });
    const firstPage = await firstResponse.json();
    if (!firstResponse.ok) {
        throw new Error(firstPage.message || "PDF data could not be prepared.");
    }

    const rows = [...firstPage.rows];
    for (let page = 2; page <= firstPage.pagination.total_pages; page += 1) {
        const response = await fetch(query(page, pageSize), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "PDF data could not be prepared.");
        rows.push(...data.rows);
    }
    return { rows, total: firstPage.pagination.total };
}

function renderFacets(facets) {
    if (!state.facetsLoaded) {
        facets.tables.forEach((item) => {
            const option = document.createElement("option");
            option.value = item.table_id;
            option.textContent = `${item.table_id} (${item.count.toLocaleString("en-IN")})`;
            elements.tableFilter.append(option);
        });
        state.facetsLoaded = true;
    }
    elements.legend.replaceChildren();
    [
        ["Value mismatches", facets.kinds.different || 0, "different"],
        ["Only in SQL Server", facets.kinds.sql_only || 0, "sql-only"],
        ["Only in PostgreSQL", facets.kinds.postgres_only || 0, "pg-only"],
    ].forEach(([label, count, kind]) => {
        const item = document.createElement("span");
        item.className = `legend-item ${kind}`;
        item.textContent = `${label}: ${Number(count).toLocaleString("en-IN")}`;
        elements.legend.append(item);
    });
}

async function loadRows() {
    state.controller?.abort();
    state.controller = new AbortController();
    elements.range.textContent = "Reading the latest saved report data…";
    try {
        const response = await fetch(query(), { signal: state.controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "The mismatch report could not be loaded.");
        state.page = data.pagination.page;
        state.totalPages = data.pagination.total_pages;
        elements.mismatchBody.replaceChildren();
        appendRows(elements.mismatchBody, data.rows);
        elements.empty.hidden = data.rows.length > 0;
        const start = data.pagination.total ? (state.page - 1) * data.pagination.page_size + 1 : 0;
        const end = Math.min(state.page * data.pagination.page_size, data.pagination.total);
        elements.range.textContent = `Showing ${start}${end > start ? `–${end}` : ""} of ${data.pagination.total.toLocaleString("en-IN")} filtered mismatch row(s)`;
        elements.pageStatus.textContent = `Page ${state.page} of ${state.totalPages}`;
        elements.previous.disabled = state.page <= 1;
        elements.next.disabled = state.page >= state.totalPages;
        renderFacets(data.facets);
    } catch (error) {
        if (error.name === "AbortError") return;
        elements.range.textContent = error.message;
        elements.empty.hidden = false;
        showToast(error.message);
    }
}

function resetToFirstPage() {
    state.page = 1;
    loadRows();
}

function applyOverviewFilter(filter) {
    let visibleResults = 0;
    elements.overviewRows.forEach((row) => {
        const visible = filter === "all" || row.dataset.overviewResult === filter;
        row.hidden = !visible;
        if (visible && row.classList.contains("overview-result-row")) visibleResults += 1;
    });
    elements.overviewFilters.forEach((button) => {
        const active = button.dataset.overviewFilter === filter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    if (elements.emptyOverview) elements.emptyOverview.hidden = visibleResults > 0;
}

function showToast(message, type = "error") {
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

elements.filters.addEventListener("submit", (event) => event.preventDefault());
elements.overviewFilters.forEach((button) => {
    button.addEventListener("click", () => applyOverviewFilter(button.dataset.overviewFilter));
});
elements.tableFilter.addEventListener("change", resetToFirstPage);
elements.kindFilter.addEventListener("change", resetToFirstPage);
elements.search.addEventListener("input", () => {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(resetToFirstPage, 300);
});
elements.clearFilters.addEventListener("click", () => {
    elements.tableFilter.value = "";
    elements.kindFilter.value = "";
    elements.search.value = "";
    resetToFirstPage();
});
elements.previous.addEventListener("click", () => {
    if (state.page > 1) {
        state.page -= 1;
        loadRows();
    }
});
elements.next.addEventListener("click", () => {
    if (state.page < state.totalPages) {
        state.page += 1;
        loadRows();
    }
});
elements.themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

elements.exportPdf.addEventListener("click", async () => {
    elements.exportPdf.disabled = true;
    elements.exportPdf.textContent = "Preparing PDF…";
    try {
        const data = await loadAllFilteredMismatchRows();
        elements.printBody.replaceChildren();
        appendRows(elements.printBody, data.rows);
        elements.printScope.textContent =
            `${data.total.toLocaleString("en-IN")} mismatch row(s) match the selected filters.`;
        document.body.classList.add("printing");
        window.print();
    } catch (error) {
        showToast(error.message);
    } finally {
        document.body.classList.remove("printing");
        elements.exportPdf.disabled = false;
        elements.exportPdf.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"/></svg> Export PDF';
    }
});

applyTheme(document.documentElement.dataset.theme || "dark", false);
loadRows();
