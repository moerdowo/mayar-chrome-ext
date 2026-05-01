const API_BASE = "https://api.mayar.id";

const state = {
  apiKey: "",
  tab: "paid",
  page: 1,
  pageSize: 10,
  hasMore: false,
  pageCount: null,
};

const $ = (id) => document.getElementById(id);

const idr = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const fmtDate = (ms) => {
  if (!ms) return "";
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

async function loadSettings() {
  const { mayarApiKey = "" } = await chrome.storage.local.get(["mayarApiKey"]);
  state.apiKey = mayarApiKey;
}

async function saveSettings() {
  const apiKey = $("apiKeyInput").value.trim();
  await chrome.storage.local.set({ mayarApiKey: apiKey });
  state.apiKey = apiKey;
  toggleSettings(false);
  refreshAll();
}

function toggleSettings(show) {
  const panel = $("settingsPanel");
  if (show) {
    $("apiKeyInput").value = state.apiKey;
    panel.classList.remove("hidden");
  } else {
    panel.classList.add("hidden");
  }
}

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg || "";
  el.classList.toggle("error", !!isError);
}

async function api(path) {
  if (!state.apiKey) throw new Error("API key not set. Open settings to add it.");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${state.apiKey}`,
      Accept: "application/json",
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    /* non-json */
  }
  if (!res.ok) {
    const m = (body && (body.messages || body.message)) || `HTTP ${res.status}`;
    throw new Error(m);
  }
  return body;
}

function renderSkeletons(count = 4) {
  const list = $("txList");
  list.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "skeleton";
    list.appendChild(d);
  }
}

function renderBalance(data) {
  if (!data) {
    $("balanceTotal").textContent = "—";
    $("balanceActive").textContent = "—";
    $("balancePending").textContent = "—";
    return;
  }
  $("balanceTotal").textContent = idr(data.balance);
  $("balanceActive").textContent = idr(data.balanceActive);
  $("balancePending").textContent = idr(data.balancePending);
}

function txCardPaid(tx) {
  const name = tx.customer?.name || tx.customer?.email || "Unknown";
  const sub = [tx.balanceHistoryType, tx.paymentMethod].filter(Boolean).join(" · ");
  const status = tx.status ? `<span class="badge ${escapeHtml(tx.status)}">${escapeHtml(tx.status)}</span>` : "";
  return `
    <div class="tx">
      <div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="meta">${escapeHtml(sub)}</div>
      </div>
      <div class="amount credit">${idr(tx.credit)}</div>
      <div class="row2">
        <div class="meta">${escapeHtml(fmtDate(tx.createdAt))}</div>
        ${status}
      </div>
    </div>`;
}

function txCardUnpaid(tx) {
  const name = tx.customer?.name || tx.customer?.email || "Unknown";
  const sub = [tx.type].filter(Boolean).join(" · ");
  const status = tx.status ? `<span class="badge ${escapeHtml(tx.status)}">${escapeHtml(tx.status)}</span>` : "";
  const link = tx.paymentUrl
    ? `<a href="${escapeHtml(tx.paymentUrl)}" target="_blank" rel="noopener noreferrer">Open payment ↗</a>`
    : "";
  return `
    <div class="tx">
      <div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="meta">${escapeHtml(sub)}</div>
      </div>
      <div class="amount unpaid">${idr(tx.amount)}</div>
      <div class="row2">
        <div class="meta">${escapeHtml(fmtDate(tx.createdAt))} ${link}</div>
        ${status}
      </div>
    </div>`;
}

function renderTransactions(payload) {
  const list = $("txList");
  const items = (payload && payload.data) || [];
  if (!items.length) {
    list.innerHTML = `<div class="empty">No ${state.tab} transactions.</div>`;
  } else {
    const render = state.tab === "paid" ? txCardPaid : txCardUnpaid;
    list.innerHTML = items.map(render).join("");
  }
  state.hasMore = !!payload?.hasMore;
  state.pageCount = payload?.pageCount ?? null;
  $("prevBtn").disabled = state.page <= 1;
  $("nextBtn").disabled = !state.hasMore;
  const totalLabel = state.pageCount ? ` of ${state.pageCount}` : "";
  $("pageInfo").textContent = `Page ${state.page}${totalLabel}`;
}

async function loadBalance() {
  try {
    const r = await api("/hl/v1/balance");
    renderBalance(r?.data);
  } catch (e) {
    renderBalance(null);
    setStatus(`Balance: ${e.message}`, true);
  }
}

async function loadTransactions() {
  renderSkeletons();
  setStatus("Loading…");
  try {
    const path =
      state.tab === "paid"
        ? `/hl/v1/transactions?page=${state.page}&pageSize=${state.pageSize}`
        : `/hl/v1/transactions/unpaid?page=${state.page}&pageSize=${state.pageSize}`;
    const r = await api(path);
    renderTransactions(r);
    setStatus("");
  } catch (e) {
    $("txList").innerHTML = "";
    setStatus(e.message, true);
    $("prevBtn").disabled = state.page <= 1;
    $("nextBtn").disabled = true;
  }
}

async function refreshAll() {
  if (!state.apiKey) {
    setStatus("Add your Mayar API key in settings to continue.", true);
    renderBalance(null);
    $("txList").innerHTML = "";
    toggleSettings(true);
    return;
  }
  await Promise.all([loadBalance(), loadTransactions()]);
}

function bindEvents() {
  $("settingsBtn").addEventListener("click", () => toggleSettings($("settingsPanel").classList.contains("hidden")));
  $("cancelSettingsBtn").addEventListener("click", () => toggleSettings(false));
  $("saveSettingsBtn").addEventListener("click", saveSettings);
  $("refreshBtn").addEventListener("click", refreshAll);

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.tab;
      if (next === state.tab) return;
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      state.tab = next;
      state.page = 1;
      loadTransactions();
    });
  });

  $("prevBtn").addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadTransactions();
  });
  $("nextBtn").addEventListener("click", () => {
    if (!state.hasMore) return;
    state.page += 1;
    loadTransactions();
  });
}

(async function init() {
  bindEvents();
  await loadSettings();
  refreshAll();
})();
