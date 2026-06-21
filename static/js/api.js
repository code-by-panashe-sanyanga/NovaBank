// Shared API helper + auth gate for NovaBank pages.

const TOKEN_KEY = "novabank_token";
const THEME_KEY = "novabank_theme";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function errorMessage(data) {
  if (!data) return "Request failed";
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg) {
    return data.detail[0].msg;
  }
  return data.error || "Request failed";
}

async function api(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(path, Object.assign({}, options, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(errorMessage(data));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = "/login";
    return false;
  }
  return true;
}

function getTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}

function applyTheme() {
  const theme = getTheme();
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll("[data-theme-toggle]").forEach(function (el) {
    const isDark = theme === "dark";
    el.setAttribute("aria-pressed", isDark ? "true" : "false");
    el.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    const label = el.querySelector("[data-theme-label]");
    if (label) label.textContent = isDark ? "Dark" : "Light";
  });
}

function toggleTheme() {
  const next = getTheme() === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
}

function logout() {
  const token = getToken();
  if (token) {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: "{}",
    }).catch(function () {});
  }
  clearToken();
  window.location.href = "/login";
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function moneyGBP(value) {
  const n = Number(value);
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, kind) {
  const host = document.getElementById("toast-host");
  if (!host || !message) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind === "error" ? " toast-error" : "");
  el.textContent = message;
  host.appendChild(el);
  setTimeout(function () {
    el.classList.add("toast-out");
    setTimeout(function () {
      el.remove();
    }, 280);
  }, 3200);
}

/** Live updates after money posts (balance / notification events). */
function connectLive(onEvent) {
  const token = getToken();
  if (!token || !window.WebSocket) return null;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(proto + "://" + location.host + "/ws?token=" + encodeURIComponent(token));
  ws.onmessage = function (ev) {
    let payload = null;
    try {
      payload = JSON.parse(ev.data);
    } catch (e) {
      payload = null;
    }
    if (payload && payload.event === "notification" && payload.data) {
      const title = payload.data.title || "Update";
      const msg = payload.data.message || "";
      showToast(title + (msg ? " · " + msg : ""), "ok");
    }
    if (typeof onEvent === "function") onEvent(payload);
  };
  return ws;
}

applyTheme();
