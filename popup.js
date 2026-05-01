const API_BASE = "https://api.mayar.id";

const state = {
  apiKey: "",
  theme: "dark",
  tab: "paid",
  page: 1,
  pageSize: 10,
  hasMore: false,
  pageCount: null,
  items: [],
  detail: null,
  productSearch: "",
};

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  state.theme = t;
}

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
  const { mayarApiKey = "", mayarTheme = "dark" } = await chrome.storage.local.get([
    "mayarApiKey",
    "mayarTheme",
  ]);
  state.apiKey = mayarApiKey;
  applyTheme(mayarTheme);
}

async function saveSettings() {
  const apiKey = $("apiKeyInput").value.trim();
  const theme = $("themeSelect").value;
  await chrome.storage.local.set({ mayarApiKey: apiKey, mayarTheme: theme });
  state.apiKey = apiKey;
  applyTheme(theme);
  toggleSettings(false);
  refreshAll();
}

function toggleSettings(show) {
  const panel = $("settingsPanel");
  if (show) {
    $("apiKeyInput").value = state.apiKey;
    $("themeSelect").value = state.theme;
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
    <div class="tx clickable" data-id="${escapeHtml(tx.id || "")}">
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

function productCard(p) {
  const name = p.name || "Untitled";
  const sub = [p.type, p.status].filter(Boolean).join(" · ");
  const productUrl = p.linkUrl || "";
  const checkoutUrl = p.linkPayment || "";
  const status = p.status
    ? `<span class="badge ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span>`
    : "";
  const priceLabel = p.type === "membership" ? "Various" : idr(p.amount);
  const linkBtn = productUrl
    ? `<button class="copy-btn" data-copy="${escapeHtml(productUrl)}" data-label="Product link"><span class="icon">⧉</span> Copy link</button>`
    : `<button class="copy-btn" disabled><span class="icon">⧉</span> Copy link</button>`;
  const checkoutBtn = checkoutUrl
    ? `<button class="copy-btn" data-copy="${escapeHtml(checkoutUrl)}" data-label="Checkout link"><span class="icon">⧉</span> Copy checkout</button>`
    : `<button class="copy-btn" disabled><span class="icon">⧉</span> Copy checkout</button>`;
  return `
    <div class="tx">
      <div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="meta">${escapeHtml(sub)}</div>
      </div>
      <div class="amount credit">${escapeHtml(priceLabel)}</div>
      <div class="row2">
        ${status}
      </div>
      <div class="actions-row">
        ${linkBtn}
        ${checkoutBtn}
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
    <div class="tx clickable" data-id="${escapeHtml(tx.id || "")}">
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

const RENDERERS = {
  paid: txCardPaid,
  unpaid: txCardUnpaid,
  products: productCard,
};

const EMPTY_LABEL = {
  paid: "No paid transactions.",
  unpaid: "No unpaid transactions.",
  products: "No products found.",
};

function renderTransactions(payload) {
  const list = $("txList");
  const items = (payload && payload.data) || [];
  state.items = items;
  if (!items.length) {
    list.innerHTML = `<div class="empty">${EMPTY_LABEL[state.tab] || "No items."}</div>`;
  } else {
    const render = RENDERERS[state.tab] || txCardPaid;
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

const PATHS = {
  paid: (page, size) => `/hl/v1/transactions?page=${page}&pageSize=${size}`,
  unpaid: (page, size) => `/hl/v1/transactions/unpaid?page=${page}&pageSize=${size}`,
  products: (page, size) => {
    const q = state.productSearch.trim();
    const base = `/hl/v1/product?page=${page}&pageSize=${size}`;
    return q ? `${base}&search=${encodeURIComponent(q)}` : base;
  },
};

async function loadTransactions() {
  renderSkeletons();
  setStatus("Loading…");
  try {
    const buildPath = PATHS[state.tab] || PATHS.paid;
    const path = buildPath(state.page, state.pageSize);
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

function kvRow(label, value, opts = {}) {
  if (value === null || value === undefined || value === "") return "";
  const cls = ["v"];
  if (opts.mono) cls.push("mono");
  return `<div class="k">${escapeHtml(label)}</div><div class="${cls.join(" ")}">${opts.html ? value : escapeHtml(value)}</div>`;
}

function copyButton(value, label) {
  if (!value) return "";
  return `<button class="copy-btn" data-copy="${escapeHtml(value)}" data-label="${escapeHtml(label)}"><span class="icon">⧉</span> Copy</button>`;
}

function renderPaidDetail(tx) {
  const name = tx.customer?.name || tx.customer?.email || "Unknown";
  const status = tx.status
    ? `<span class="badge ${escapeHtml(tx.status)}">${escapeHtml(tx.status)}</span>`
    : "";
  return `
    <div class="detail-card">
      <div class="detail-title">${escapeHtml(name)}</div>
      <div class="meta">${escapeHtml([tx.balanceHistoryType, tx.paymentMethod].filter(Boolean).join(" · "))}</div>
      <div class="detail-amount credit">${idr(tx.credit)}</div>
      <div class="kv">
        ${status ? `<div class="k">Status</div><div class="v">${status}</div>` : ""}
        ${kvRow("Type", tx.balanceHistoryType)}
        ${kvRow("Payment", tx.paymentMethod)}
        ${kvRow("Created", fmtDate(tx.createdAt))}
      </div>
    </div>
    <div class="detail-card">
      <div class="kv">
        ${kvRow("Customer", tx.customer?.name)}
        ${kvRow("Email", tx.customer?.email)}
        ${kvRow("Mobile", tx.customer?.mobile)}
        ${tx.customer?.id ? `<div class="k">Customer ID</div><div class="v mono">${escapeHtml(tx.customer.id)} ${copyButton(tx.customer.id, "Customer ID")}</div>` : ""}
      </div>
    </div>
    <div class="detail-card">
      <div class="kv">
        ${tx.id ? `<div class="k">Transaction ID</div><div class="v mono">${escapeHtml(tx.id)} ${copyButton(tx.id, "Transaction ID")}</div>` : ""}
      </div>
    </div>`;
}

function renderUnpaidDetail(tx) {
  const name = tx.customer?.name || tx.customer?.email || "Unknown";
  const status = tx.status
    ? `<span class="badge ${escapeHtml(tx.status)}">${escapeHtml(tx.status)}</span>`
    : "";
  const paymentLink = tx.paymentUrl
    ? `<a href="${escapeHtml(tx.paymentUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tx.paymentUrl)}</a> ${copyButton(tx.paymentUrl, "Payment link")}`
    : "";
  return `
    <div class="detail-card">
      <div class="detail-title">${escapeHtml(name)}</div>
      <div class="meta">${escapeHtml(tx.type || "")}</div>
      <div class="detail-amount unpaid">${idr(tx.amount)}</div>
      <div class="kv">
        ${status ? `<div class="k">Status</div><div class="v">${status}</div>` : ""}
        ${kvRow("Type", tx.type)}
        ${kvRow("Created", fmtDate(tx.createdAt))}
      </div>
    </div>
    <div class="detail-card">
      <div class="kv">
        ${kvRow("Customer", tx.customer?.name)}
        ${kvRow("Email", tx.customer?.email)}
        ${kvRow("Mobile", tx.customer?.mobile)}
        ${tx.customer?.id ? `<div class="k">Customer ID</div><div class="v mono">${escapeHtml(tx.customer.id)} ${copyButton(tx.customer.id, "Customer ID")}</div>` : ""}
      </div>
    </div>
    ${paymentLink ? `<div class="detail-card"><div class="kv"><div class="k">Payment URL</div><div class="v">${paymentLink}</div></div></div>` : ""}
    <div class="detail-card">
      <div class="kv">
        ${tx.id ? `<div class="k">Transaction ID</div><div class="v mono">${escapeHtml(tx.id)} ${copyButton(tx.id, "Transaction ID")}</div>` : ""}
      </div>
    </div>`;
}

const DETAIL_RENDERERS = {
  paid: renderPaidDetail,
  unpaid: renderUnpaidDetail,
};

function showDetail(tab, item) {
  const render = DETAIL_RENDERERS[tab];
  if (!render) return;
  state.detail = { tab, item };
  $("detailBody").innerHTML = render(item);
  $("detailView").classList.remove("hidden");
  $("balanceCard").classList.add("hidden");
  document.querySelector("nav.tabs").classList.add("hidden");
  $("txList").classList.add("hidden");
  document.querySelector(".pager").classList.add("hidden");
}

function hideDetail() {
  state.detail = null;
  $("detailView").classList.add("hidden");
  $("balanceCard").classList.remove("hidden");
  document.querySelector("nav.tabs").classList.remove("hidden");
  $("txList").classList.remove("hidden");
  document.querySelector(".pager").classList.remove("hidden");
}

let toastTimer = null;
function showToast(msg) {
  const el = $("copyToast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 1400);
}

async function handleCopyClick(btn) {
  const value = btn.dataset.copy;
  const label = btn.dataset.label || "Link";
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1200);
    showToast(`${label} copied`);
  } catch (e) {
    setStatus(`Copy failed: ${e.message}`, true);
  }
}

function bindEvents() {
  $("settingsBtn").addEventListener("click", () => toggleSettings($("settingsPanel").classList.contains("hidden")));
  $("cancelSettingsBtn").addEventListener("click", () => toggleSettings(false));
  $("saveSettingsBtn").addEventListener("click", saveSettings);
  $("refreshBtn").addEventListener("click", refreshAll);

  $("txList").addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-btn");
    if (btn && !btn.disabled) {
      handleCopyClick(btn);
      return;
    }
    if (e.target.closest("a")) return;
    const card = e.target.closest(".tx.clickable");
    if (!card) return;
    const id = card.dataset.id;
    const item = state.items.find((it) => it.id === id);
    if (item) showDetail(state.tab, item);
  });

  $("detailBackBtn").addEventListener("click", hideDetail);
  $("detailView").addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-btn");
    if (btn && !btn.disabled) handleCopyClick(btn);
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.tab;
      if (next === state.tab) return;
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      state.tab = next;
      state.page = 1;
      if (state.detail) hideDetail();
      updateSearchBar();
      loadTransactions();
    });
  });

  let searchTimer = null;
  $("searchInput").addEventListener("input", (e) => {
    const value = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (value === state.productSearch) return;
      state.productSearch = value;
      state.page = 1;
      loadTransactions();
    }, 350);
  });
  $("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchTimer);
      const value = e.target.value;
      if (value === state.productSearch) return;
      state.productSearch = value;
      state.page = 1;
      loadTransactions();
    } else if (e.key === "Escape") {
      e.target.value = "";
      $("searchClearBtn").click();
    }
  });
  $("searchClearBtn").addEventListener("click", () => {
    $("searchInput").value = "";
    if (state.productSearch === "") return;
    state.productSearch = "";
    state.page = 1;
    loadTransactions();
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

function updateSearchBar() {
  const bar = $("searchBar");
  if (state.tab === "products") {
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
}

(async function init() {
  bindEvents();
  await loadSettings();
  updateSearchBar();
  refreshAll();
})();
