/* Own Custom Calling Agent — site + panel logic (vanilla JS). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const FALLBACK_VOICES = {
  female: [
    { id: "aparna_hi_customer", name: "Aparna", model: "bulbul:v4-flash", desc: "Warm, empathetic — best for care" },
    { id: "priya", name: "Priya", model: "bulbul:v3", desc: "Calm, top-rated Hindi female" },
    { id: "suhani", name: "Suhani", model: "bulbul:v3", desc: "Soft and gentle" },
  ],
  male: [
    { id: "shubh_hi_customer", name: "Shubh", model: "bulbul:v4-flash", desc: "Steady, reassuring" },
    { id: "ratan_hi_customer_expressive", name: "Ratan", model: "bulbul:v4-flash", desc: "Expressive, warm" },
    { id: "shubh", name: "Shubh", model: "bulbul:v3", desc: "Classic calm male" },
    { id: "ratan", name: "Ratan", model: "bulbul:v3", desc: "Clear, friendly" },
  ],
};
/* NOTE: contacts are NOT in the public bundle — they are fetched from the
   admin-only API (/api/contacts) after the admin signs in. */

const state = {
  apiBase: localStorage.getItem("apiBase") || "",
  connected: false,
  gender: "female",
  voices: FALLBACK_VOICES,
  voice: FALLBACK_VOICES.female[0],
  contacts: [],
  selected: new Set(),
  mode: "health",
  manual: [],
  token: localStorage.getItem("token") || "",
  user: null,
};
const isAdmin = () => !!state.user && state.user.role === "admin";

const initials = (n) => String(n || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const api = (p) => `${state.apiBase.replace(/\/$/, "")}${p}`;
const authHeaders = () => (state.token ? { Authorization: `Bearer ${state.token}` } : {});

function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.className = "toast"), 3600);
}

/* ---------- role / visibility ---------- */
function applyRole() {
  const admin = isAdmin();
  $$(".admin-only").forEach((el) => { el.hidden = !admin; });
  $("#signinBtn").hidden = !!state.user;
  $("#signoutBtn").hidden = !state.user;
  const chip = $("#userChip");
  if (state.user) {
    chip.hidden = false;
    chip.textContent = `${state.user.email}${admin ? " · admin" : ""}`;
  } else {
    chip.hidden = true;
  }
}

/* ---------- auth ---------- */
let authTab = "login";
function openAuth(tab = "login") {
  authTab = tab;
  $("#authModal").hidden = false;
  setAuthTab(tab);
  $("#authMsg").textContent = "";
}
function closeAuth() { $("#authModal").hidden = true; }
function setAuthTab(tab) {
  authTab = tab;
  $$("#authTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const signup = tab === "signup";
  $("#authName").hidden = !signup;
  $("#authTitle").textContent = signup ? "Create your account" : "Welcome back";
  $("#authSub").textContent = signup ? "Sign up to use the site." : "Sign in to your account.";
  $("#authSubmit").textContent = signup ? "Sign up" : "Sign in";
  $("#authPassword").autocomplete = signup ? "new-password" : "current-password";
}
async function doAuth() {
  const body = {
    email: $("#authEmail").value.trim(),
    password: $("#authPassword").value,
    name: $("#authName").value.trim(),
  };
  $("#authMsg").textContent = "Please wait…";
  try {
    const r = await fetch(api(`/api/auth/${authTab}`), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    state.token = j.token; state.user = j.user;
    localStorage.setItem("token", j.token);
    closeAuth();
    applyRole();
    toast(`Signed in as ${j.user.email}${isAdmin() ? " (admin)" : ""}`, "ok");
    afterLogin();
  } catch (e) {
    $("#authMsg").textContent = e.message;
  }
}
function logout() {
  state.token = ""; state.user = null; state.contacts = []; state.selected = new Set();
  localStorage.removeItem("token");
  applyRole(); renderContacts();
  toast("Signed out");
}
async function loadMe() {
  if (!state.token) return;
  try {
    const r = await fetch(api("/api/auth/me"), { headers: authHeaders() });
    if (!r.ok) throw new Error();
    const j = await r.json();
    state.user = j.user;
  } catch {
    state.token = ""; state.user = null; localStorage.removeItem("token");
  }
}
function afterLogin() {
  loadVoices();
  if (isAdmin()) { loadContacts(); loadActivity(); checkStatus(); }
}

/* ---------- voices ---------- */
function renderVoices() {
  const list = $("#voiceList");
  list.innerHTML = "";
  state.voices[state.gender].forEach((v) => {
    const sel = state.voice && state.voice.id === v.id && state.voice.model === v.model;
    const el = document.createElement("div");
    el.className = `voice${sel ? " sel" : ""}`;
    el.innerHTML = `<div class="avatar">${initials(v.name)}</div>
      <div class="meta"><b>${v.name}</b><small>${v.desc}</small></div><div class="check">✓</div>`;
    el.onclick = () => { state.voice = v; renderVoices(); updateLaunch(); };
    list.appendChild(el);
  });
}
$$("#genderSeg button").forEach((b) => b.onclick = () => {
  $$("#genderSeg button").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  state.gender = b.dataset.gender;
  state.voice = state.voices[state.gender][0];
  renderVoices();
});
$$("#modeSeg button").forEach((b) => b.onclick = () => {
  $$("#modeSeg button").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  state.mode = b.dataset.mode;
  $("#instrWrap").hidden = state.mode !== "custom";
  $("#healthNote").hidden = state.mode === "custom";
  updateLaunch();
});

/* ---------- contacts (admin only) ---------- */
function renderContacts() {
  const wrap = $("#contactChips");
  wrap.innerHTML = "";
  [...state.contacts, ...state.manual].forEach((c) => {
    const sel = state.selected.has(c.number);
    const el = document.createElement("div");
    el.className = `chip${sel ? " sel" : ""}`;
    el.innerHTML = `<div class="avatar">${initials(c.name)}</div>
      <div class="meta"><b>${c.name}</b><small>${c.number}</small></div>
      ${c.register === "respectful" ? '<span class="tag">elder</span>' : ""}`;
    el.onclick = () => {
      state.selected.has(c.number) ? state.selected.delete(c.number) : state.selected.add(c.number);
      renderContacts(); updateLaunch();
    };
    wrap.appendChild(el);
  });
}
$("#selectAll").onclick = () => {
  const all = [...state.contacts, ...state.manual];
  const everyOn = all.length && all.every((c) => state.selected.has(c.number));
  state.selected = everyOn ? new Set() : new Set(all.map((c) => c.number));
  renderContacts(); updateLaunch();
};
$("#addManual").onclick = () => {
  const raw = $("#manualNumber").value.trim().replace(/\s+/g, "");
  if (!/^\+?\d{8,15}$/.test(raw)) return toast("Enter a valid number, e.g. +911234567890", "err");
  const num = raw.startsWith("+") ? raw : `+${raw}`;
  if (![...state.contacts, ...state.manual].some((c) => c.number === num))
    state.manual.push({ name: "Custom", number: num, register: "respectful" });
  state.selected.add(num);
  $("#manualNumber").value = "";
  renderContacts(); updateLaunch();
};
function updateLaunch() {
  const n = state.selected.size;
  const v = state.voice ? `${state.voice.name} · ${state.gender}` : "—";
  $("#launchTitle").textContent = n ? `Ready to call ${n} ${n === 1 ? "person" : "people"}` : "Ready to dial";
  $("#launchSub").textContent = n
    ? `Voice: ${v}  ·  Mode: ${state.mode === "custom" ? "custom instructions" : "health check-in"}`
    : "Pick a voice and at least one contact.";
  $("#callBtn").disabled = n === 0;
}

/* ---------- backend ---------- */
async function connect() {
  const base = $("#apiBase").value.trim().replace(/\/$/, "");
  state.apiBase = base;
  localStorage.setItem("apiBase", base);
  try {
    const r = await fetch(api("/api/health"));
    if (!r.ok) throw new Error(r.status);
    state.connected = true;
    $("#connDot").className = "dot ok";
    checkStatus();
    if (isAdmin()) { loadVoices(); loadContacts(); loadActivity(); }
  } catch {
    state.connected = false;
    $("#connDot").className = "dot bad";
  }
}
async function checkStatus() {
  const dot = $("#statusDot"), label = $("#statusLabel"), detail = $("#statusDetail"), lat = $("#statusLatency");
  if (!dot) return;
  const engine = state.apiBase ? state.apiBase.replace(/^https?:\/\//, "") : "Netlify functions (this site)";
  label.textContent = engine;
  dot.className = "dot"; detail.textContent = ""; lat.textContent = "";
  const t0 = performance.now();
  try {
    const r = await fetch(api("/api/health"));
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    dot.className = "dot ok";
    detail.textContent = j.ok ? "Online" : "Unknown";
    lat.textContent = `${ms} ms`;
    if (j.checks) {
      const miss = [];
      if (!j.checks.sarvam) miss.push("Sarvam key");
      if (!j.checks.twilio) miss.push("Twilio");
      if (!j.checks.email) miss.push("email");
      detail.textContent = miss.length ? `Online — missing: ${miss.join(", ")}` : "Online — all set";
      if (j.checks.from_number) lat.textContent = `${ms} ms · from ${j.checks.from_number}`;
    }
  } catch {
    dot.className = "dot bad";
    detail.textContent = "Offline — check the URL or that the engine is running";
  }
}
async function loadVoices() {
  try { const r = await fetch(api("/api/voices")); if (r.ok) { state.voices = await r.json(); state.voice = state.voices[state.gender][0]; renderVoices(); } } catch {}
}
async function loadContacts() {
  if (!isAdmin()) return;
  try { const r = await fetch(api("/api/contacts"), { headers: authHeaders() }); if (r.ok) { state.contacts = await r.json(); renderContacts(); } } catch {}
}
async function loadActivity() {
  if (!isAdmin()) return;
  try {
    const r = await fetch(api("/api/summaries"), { headers: authHeaders() });
    if (!r.ok) return;
    const items = await r.json();
    const box = $("#activity");
    if (!items.length) { box.innerHTML = '<div class="empty">No calls yet. Your summaries will appear here.</div>'; return; }
    box.innerHTML = "";
    items.slice().reverse().forEach((s) => {
      const bad = !s.reached;
      const warn = s.follow_up_needed || s.sentiment === "negative";
      const kind = bad ? "neg" : warn ? "warn" : "pos";
      const label = bad ? "Not reached" : warn ? "Follow up" : "Okay";
      const el = document.createElement("div");
      el.className = "rec";
      el.innerHTML = `<div class="top"><b>${s.person || "Unknown"}</b><span class="badge ${kind}">${label}</span></div>
        <p>${s.concerns || "—"}</p>`;
      box.appendChild(el);
    });
  } catch {}
}
$("#previewBtn").onclick = async () => {
  if (!isAdmin()) return toast("Admins only", "err");
  const btn = $("#previewBtn");
  btn.classList.add("playing"); btn.disabled = true;
  $("#previewHint").textContent = "Synthesising…";
  try {
    const r = await fetch(api("/api/preview"), {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ voice: state.voice.id, model: state.voice.model, text: $("#previewText").value }),
    });
    if (!r.ok) throw new Error(await r.text());
    const a = $("#previewAudio");
    a.src = URL.createObjectURL(await r.blob());
    await a.play();
    $("#previewHint").textContent = `${state.voice.name} · ${state.voice.model}`;
  } catch {
    toast("Preview failed — check your Sarvam key.", "err");
    $("#previewHint").textContent = "Preview failed";
  } finally { btn.classList.remove("playing"); btn.disabled = false; }
};
$("#callBtn").onclick = async () => {
  if (!isAdmin()) return toast("Admins only", "err");
  const targets = [...state.selected];
  if (!targets.length) return;
  if (state.mode === "custom" && !$("#instructions").value.trim())
    return toast("Add your instructions for the AI", "err");
  const btn = $("#callBtn");
  btn.disabled = true; btn.textContent = "Dialing…";
  try {
    const r = await fetch(api("/api/call"), {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ targets, voice: state.voice.id, model: state.voice.model, gender: state.gender,
        mode: state.mode, instructions: $("#instructions").value.trim() }),
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    toast(`Placed ${data.placed.length} call${data.placed.length === 1 ? "" : "s"} ✓`, "ok");
    setTimeout(loadActivity, 4000);
  } catch { toast("Couldn't place calls — check Twilio settings.", "err"); }
  finally { btn.disabled = false; btn.textContent = "Place calls"; }
};
$("#refreshBtn").onclick = () => { loadActivity(); toast("Refreshed"); };
$("#apiBase").addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
$("#connectBtn").onclick = connect;

/* ---------- auth UI wiring ---------- */
$("#signinBtn").onclick = () => openAuth("login");
$("#signoutBtn").onclick = logout;
$("#authClose").onclick = closeAuth;
$("#authModal").addEventListener("click", (e) => { if (e.target.id === "authModal") closeAuth(); });
$$("#authTabs button").forEach((b) => b.onclick = () => setAuthTab(b.dataset.tab));
$("#authSubmit").onclick = doAuth;
$("#authPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth(); });
$("#googleBtn").onclick = () => {
  $("#authMsg").textContent = "Google sign-in needs a Google OAuth Client ID (set GOOGLE_CLIENT_ID on the server). Email sign-up works now.";
};

/* ---------- site interactions ---------- */
const nav = $("#nav");
addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 12), { passive: true });
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
}, { threshold: 0.14 });
$$(".reveal").forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 60}ms`; io.observe(el); });
const counters = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target, end = +el.dataset.count, suffix = el.dataset.suffix || "";
    let t0 = null;
    const step = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / 1100, 1);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    counters.unobserve(el);
  });
}, { threshold: 0.6 });
$$("[data-count]").forEach((el) => counters.observe(el));
$("#yr").textContent = new Date().getFullYear();
$("#connToggle").onclick = () => { const p = $("#connPanel"); p.hidden = !p.hidden; };

/* ---------- boot ---------- */
(async function init() {
  $("#apiBase").value = state.apiBase;
  renderVoices(); renderContacts(); updateLaunch();
  await loadMe();
  applyRole();
  connect();
  checkStatus();
  setInterval(checkStatus, 30000);
  $("#statusCheck").onclick = checkStatus;
})();
