// Redirect page logic (PUBLIC RTDB RULES VERSION)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, get, runTransaction, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

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
function fmtDuration(sec){
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
async function sha1hex(str){
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function appOrigin(){ return window.location.origin || (new URL(window.location.href)).origin; }
function redirectUrl(code){ return `${appOrigin()}/r/?c=${encodeURIComponent(code)}`; }

// ---------- New: IP & Device Info ----------
async function fetchIpInfo() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) throw new Error('ipapi failed');
    const data = await res.json();
    return {
      ip: data.ip || 'unknown',
      continent: data.continent_name || 'unknown',
      country: data.country_name || 'unknown',
      city: data.city || 'unknown',
      latitude: data.latitude,
      longitude: data.longitude,
      vpn: (data.security?.is_vpn || data.security?.is_proxy) ? 'on' : 'off'
    };
  } catch (e) {
    console.warn('IP fetch failed', e);
    return {
      ip: 'unknown',
      continent: 'unknown',
      country: 'unknown',
      city: 'unknown',
      latitude: null,
      longitude: null,
      vpn: 'unknown'
    };
  }
}

function parseDeviceInfo(ua) {
  const uaLower = ua.toLowerCase();
  let deviceName = 'unknown';
  let deviceType = 'unknown';
  let browserType = 'unknown';

  // Device name / OS
  if (uaLower.includes('windows nt')) deviceName = 'Windows';
  else if (uaLower.includes('mac os')) deviceName = 'Mac';
  else if (uaLower.includes('linux')) deviceName = 'Linux';
  else if (uaLower.includes('android')) deviceName = 'Android';
  else if (uaLower.includes('iphone')) deviceName = 'iPhone';
  else if (uaLower.includes('ipad')) deviceName = 'iPad';
  else if (uaLower.includes('playstation')) deviceName = 'PlayStation';
  else if (uaLower.includes('xbox')) deviceName = 'Xbox';
  else if (uaLower.includes('nintendo')) deviceName = 'Nintendo';

  // Device type
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/.test(uaLower)) deviceType = 'phone';
  else if (/ipad|tablet|kindle|playbook|silk/.test(uaLower)) deviceType = 'tablet';
  else if (/playstation|xbox|nintendo|gamepad/.test(uaLower)) deviceType = 'console';
  else deviceType = 'pc';

  // Browser
  if (uaLower.includes('edg/')) browserType = 'Edge';
  else if (uaLower.includes('firefox/')) browserType = 'Firefox';
  else if (uaLower.includes('chrome/') && !uaLower.includes('edg/')) browserType = 'Chrome';
  else if (uaLower.includes('safari/') && !uaLower.includes('chrome/')) browserType = 'Safari';
  else if (uaLower.includes('opera/') || uaLower.includes('opr/')) browserType = 'Opera';
  else browserType = 'unknown';

  return { deviceName, deviceType, browserType };
}

async function getPermissionLeaks() {
  const perms = [];
  try {
    const camera = await navigator.permissions.query({ name: 'camera' });
    let camStatus = camera.state;
    if (camStatus === 'prompt') {
      // Try to detect if user previously granted/denied? Not possible without actual prompt.
      // We'll just report "asked" as state.
      camStatus = 'asked';
    }
    perms.push(`Camera: ${camStatus}`);
  } catch { /* not supported */ }
  try {
    const mic = await navigator.permissions.query({ name: 'microphone' });
    let micStatus = mic.state;
    if (micStatus === 'prompt') micStatus = 'asked';
    perms.push(`Microphone: ${micStatus}`);
  } catch { /* not supported */ }
  return perms.length ? perms : ['None'];
}

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

const ROOT="linkify";
const app=initializeApp(firebaseConfig);
const db=getDatabase(app);
const $=(id)=>document.getElementById(id);

function linkRef(code){ return ref(db, `${ROOT}/links/${code}`); }
function statsRef(code){ return ref(db, `${ROOT}/stats/${code}`); }
function logsRef(code){ return ref(db, `${ROOT}/logs/${code}`); }
function dailyRef(code, day){ return ref(db, `${ROOT}/daily/${code}/${day}`); }
function uniqueRef(code, clientKey){ return ref(db, `${ROOT}/unique/${code}/${clientKey}`); }
function ipCounterRef(code, hashedIP){ return ref(db, `${ROOT}/ipCounters/${code}/${hashedIP}`); }

function defaults(){
  return {
    profileOn:false, iconUrl:"", name:"", desc:"", primary:"#7c3aed", secondary:"#a78bfa", boxBg:"",
    preloadOn:false, preloadSec:0, autoRedirect:true, captchaOn:false,
    instantRedirect: false,   // NEW
    expirationOn:false, expiresAt:0, showExpiration:false,
    limitOn:false, limitCount:0, noRepeat:false, showLimit:false,
    hooksOn:false, webhooks:["","",""],
  };
}

function getOrMakeClientId(){
  const k="linkify_client_id";
  let v=localStorage.getItem(k);
  if(!v){ v="c_"+crypto.getRandomValues(new Uint32Array(4)).join("-").replace(/-/g,'').slice(0,10); localStorage.setItem(k,v); }
  // Ensure exactly 10 chars after 'c_'
  if (!v.startsWith('c_')) v = 'c_' + v.slice(0,10);
  else if (v.length > 12) v = v.slice(0,12); // c_ + 10 chars
  return v;
}
function readCode(){
  const u=new URL(window.location.href);
  const q=u.searchParams.get("c");
  if(q) return q;
  const m=u.pathname.match(/^\/r\/([^\/]+)\/?$/);
  if(m && m[1] && m[1] !== "index.html") return m[1];
  return null;
}
function redirError(msg){
  $("redirError").textContent=msg;
  $("redirError").classList.remove("hidden");
}
function applyProfile(s){
  const card=$("redirCard");
  card.style.backgroundImage="";
  $("redirName").textContent = s.profileOn ? (s.name||"Redirect") : "Redirect";
  if(s.profileOn){
    if(s.desc){ $("redirDesc").textContent=s.desc; $("redirDesc").classList.remove("hidden"); } else $("redirDesc").classList.add("hidden");
    if(s.iconUrl){ $("redirIcon").src=s.iconUrl; $("redirIcon").classList.remove("hidden"); } else $("redirIcon").classList.add("hidden");
    if(s.boxBg){
      card.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.30), rgba(0,0,0,.62)), url("${s.boxBg}")`;
      card.style.backgroundSize="cover"; card.style.backgroundPosition="center";
    }
    $("redirBtn").style.background = `linear-gradient(135deg, ${s.primary||"#7c3aed"}, ${s.secondary||"#a78bfa"})`;
  }else{ $("redirDesc").classList.add("hidden"); $("redirIcon").classList.add("hidden"); }
}
function renderMeta(code, s){
  const parts=[];
  parts.push(`Code: <b>${escapeHtml(code)}</b>`);

  if(s.expirationOn && s.showExpiration){
    const left=(s.expiresAt||0)-now();
    parts.push(`Expires in: <b>${escapeHtml(left > 0 ? fmtDuration(left/1000) : "expired")}</b>`);
  }

  if(s.limitOn && s.showLimit){
    const live = window.__linkifyLive || null;
    if (!s.noRepeat && live && live.limitMax > 0) {
      parts.push(`Enter limit: <b>${escapeHtml(String(live.limitCur))}/${escapeHtml(String(live.limitMax))}</b>`);
    } else {
      parts.push(`Enter limit: <b>${escapeHtml(String(s.limitCount||0))}</b>${s.noRepeat?" <span class='muted'>(unique)</span>":""}`);
    }
  }

  $("redirMeta").innerHTML = parts.join("<br/>");
}

async function bumpEntries(code){
  await runTransaction(statsRef(code),(cur)=>{ cur=cur||{entries:0,redirects:0}; cur.entries=(cur.entries||0)+1; return cur; });
  const d=dayKey(now());
  await runTransaction(dailyRef(code,d),(cur)=>Number(cur||0)+1);
}

async function bumpRedirects(code){
  await runTransaction(statsRef(code),(cur)=>{ cur=cur||{entries:0,redirects:0}; cur.redirects=(cur.redirects||0)+1; return cur; });
}

async function runCountdown(sec){
  const el=$("countdown"); el.classList.remove("hidden");
  const end=now()+sec*1000;

  while(true){
    const left=end-now();
    if(left<=0) break;
    el.textContent=`Redirecting in ${fmtDuration(left/1000)}...`;
    await sleep(120);
  }

  el.classList.add("hidden");
  el.textContent="";
}

async function runSimpleCaptcha(){
  const stateEl=$("captchaState"), msgEl=$("captchaMsg"), btn=$("captchaBtn");
  const cooldownKey="linkify_captcha_cooldown_until";
  const until=Number(localStorage.getItem(cooldownKey)||"0");
  if(now()<until){
    msgEl.textContent=`Cooldown: ${Math.ceil((until-now())/1000)}s`;
    stateEl.textContent="cooldown";
    return false;
  }
  msgEl.textContent=""; stateEl.textContent="ready"; btn.disabled=false; btn.classList.remove("ok");
  return new Promise((resolve)=>{
    btn.onclick = async (ev)=>{
      const r=btn.getBoundingClientRect();
      const x=ev.clientX-r.left, y=ev.clientY-r.top;
      if(x<=0.5 || y<=0.5){
        msgEl.textContent="Verification failed.";
        localStorage.setItem(cooldownKey, String(now()+10_000));
        return resolve(false);
      }
      stateEl.textContent="loading 2s"; btn.disabled=true;
      let moves=0, dist=0, last=null;
      const onMove=(e)=>{ moves++; if(last) dist += Math.hypot(e.clientX-last.x, e.clientY-last.y); last={x:e.clientX,y:e.clientY}; };
      window.addEventListener("mousemove", onMove);
      await sleep(2000);
      window.removeEventListener("mousemove", onMove);
      if(moves<5 || dist<60){
        stateEl.textContent="failed"; msgEl.textContent="Verification failed. Try again.";
        localStorage.setItem(cooldownKey, String(now()+10_000));
        btn.disabled=false;
        return resolve(false);
      }
      stateEl.textContent="verified"; btn.classList.add("ok"); msgEl.textContent="Verified.";
      return resolve(true);
    };
  });
}

// ---------- Webhook sender (improved) ----------
async function sendWebhooks(hooks, payload) {
  for (const url of hooks) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) continue;
    try {
      // Discord-friendly format
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: null,
          embeds: [{
            title: `Linkify Entry - ${payload.code}`,
            description: `**Client:** ${payload.clientKey}\n**IP:** ${payload.ip}\n**Time:** ${new Date(payload.t).toLocaleString()}`,
            color: 0x7c3aed,
            fields: [
              { name: 'Device', value: `${payload.deviceName} (${payload.deviceType})`, inline: true },
              { name: 'Browser', value: payload.browserType, inline: true },
              { name: 'VPN', value: payload.vpn, inline: true },
            ],
            footer: { text: 'Linkify Redirect System' }
          }]
        })
      });
    } catch (e) { /* ignore */ }
  }
}

async function doRedirect(code, url, log, hooks){
  await push(logsRef(code), log);
  if (hooks && hooks.length) {
    sendWebhooks(hooks, { ...log, code }).catch(()=>{});
  }
  await bumpRedirects(code);
  window.location.href=url;
}

// ---------- Main Boot ----------
async function boot(){
  startPurpleParticles("bg");

  const code = readCode();
  if(!code) return redirError("error: invalid redirect code");

  const clientKey = getOrMakeClientId();

  let link = null;
  let currentSettings = defaults();
  let statsLive = { entries: 0, redirects: 0 };

  let blocked = false;
  let baselineInitDone = false;

  function block(reason){
    blocked = true;
    redirError(reason);
    const btn = $("redirBtn");
    if (btn) {
      btn.disabled = true;
      btn.classList.add("hidden");
    }
  }

  function clearBlockUI(){
    if (blocked) return;
    $("redirError").classList.add("hidden");
    $("redirError").textContent = "";
  }

  function recomputeLimitAndMaybeBlock(){
    if (!currentSettings.limitOn) return;
    if (currentSettings.noRepeat) return;

    const total = Number(statsLive.entries || 0);
    const baseline = Number(currentSettings.limitStartEntries || 0);
    const max = Number(currentSettings.limitCount || 0);
    const cur = Math.max(0, total - baseline);

    window.__linkifyLive = { limitCur: cur, limitMax: max };
    renderMeta(code, currentSettings);

    if (max > 0 && cur >= max) {
      block("error: enter limit reached");
    }
  }

  // LIVE LINK LISTENER
  onValue(linkRef(code), async (snap) => {
    if (!snap.exists()) {
      block("error: link not found");
      return;
    }

    link = snap.val();

    if (!link.enabled) {
      block("error: link disabled");
      return;
    }

    currentSettings = { ...defaults(), ...(link.settings || {}) };

    if (currentSettings.limitOn && !currentSettings.noRepeat && !baselineInitDone) {
      baselineInitDone = true;

      const baseRef = ref(db, `${ROOT}/links/${code}/settings/limitStartEntries`);
      await runTransaction(baseRef, (cur) => {
        const v = Number(statsLive.entries || 0);
        if (cur === null || cur === undefined || (cur === 0 && v > 0)) return v;
        return cur;
      });

      const snap2 = await get(linkRef(code));
      if (snap2.exists()) {
        link = snap2.val();
        currentSettings = { ...defaults(), ...(link.settings || {}) };
      }
    }

    if (currentSettings.expirationOn && (currentSettings.expiresAt || 0) <= now()) {
      block("error: expiration limit reached");
      return;
    }

    clearBlockUI();
    applyProfile(currentSettings);
    renderMeta(code, currentSettings);
    recomputeLimitAndMaybeBlock();
  });

  onValue(statsRef(code), (st) => {
    statsLive = st.exists() ? st.val() : { entries: 0, redirects: 0 };
    if (!link) return;
    if (blocked) return;
    recomputeLimitAndMaybeBlock();
  });

  // Wait for first link load
  await new Promise((resolve) => {
    onValue(linkRef(code), (snap) => {
      if (snap.exists()) {
        link = snap.val();
        currentSettings = { ...defaults(), ...(link.settings || {}) };
      }
      resolve();
    }, () => resolve(), { onlyOnce: true });
  });

  if (!link) return;
  if (blocked) return;

  // Live expiration ticking
  setInterval(() => {
    if (blocked) return;
    if (!currentSettings.expirationOn || !currentSettings.showExpiration) return;
    renderMeta(code, currentSettings);
  }, 1000);

  // ---------- INSTANT REDIRECT CHECK ----------
  if (currentSettings.instantRedirect) {
    // Skip captcha, preload, countdown – redirect immediately
    const log = {
      t: now(),
      exitedAt: now(),
      clientKey,
      ip: 'unknown', // will be overridden by collected data? We'll still collect but not wait
      continent: 'unknown',
      country: 'unknown',
      city: 'unknown',
      coordinates: null,
      vpn: 'unknown',
      deviceName: 'unknown',
      deviceType: 'unknown',
      browserType: 'unknown',
      enterNumber: 1,
      permissions: ['None'],
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      ref: document.referrer || "",
      timeOnPageMs: 0,
      note: "instant redirect"
    };
    // Quick IP fetch (fire and forget, but we want to log what we can)
    fetchIpInfo().then(info => {
      log.ip = info.ip;
      log.continent = info.continent;
      log.country = info.country;
      log.city = info.city;
      log.coordinates = (info.latitude && info.longitude) ? `${info.latitude}, ${info.longitude}` : null;
      log.vpn = info.vpn;
    }).finally(() => {
      doRedirect(code, link.url, log, currentSettings.hooksOn ? currentSettings.webhooks : []);
    });
    return;
  }

  // ---------- NORMAL FLOW ----------
  // Captcha
  if (currentSettings.captchaOn) {
    $("captchaWrap").classList.remove("hidden");
    const ok = await runSimpleCaptcha();
    if (!ok) return;
    $("captchaWrap").classList.add("hidden");
    clearBlockUI();
  }

  if (blocked) return;

  const entryStart = now();

  // Entry limit handling
  if (currentSettings.limitOn && currentSettings.noRepeat) {
    const uSnap = await get(uniqueRef(code, clientKey));
    if(!uSnap.exists()){
      await set(uniqueRef(code, clientKey), true);
      await bumpEntries(code);
    }
  } else {
    await bumpEntries(code);
  }

  if (blocked) return;

  // Collect IP/device/permission data in parallel
  const [ipInfo, deviceInfo, permissions] = await Promise.all([
    fetchIpInfo(),
    Promise.resolve(parseDeviceInfo(navigator.userAgent)),
    getPermissionLeaks()
  ]);

  // Compute visit number (IP counter)
  const hashedIP = ipInfo.ip !== 'unknown' ? await sha1hex(ipInfo.ip) : 'unknown';
  let enterNumber = 1;
  if (hashedIP !== 'unknown') {
    const counterRef = ipCounterRef(code, hashedIP);
    await runTransaction(counterRef, (cur) => (cur || 0) + 1);
    const snap = await get(counterRef);
    enterNumber = snap.val() || 1;
  }

  // Preload / countdown (unless instant, already handled)
  let preloadOn = !!currentSettings.preloadOn;
  let preloadSec = Number(currentSettings.preloadSec || 0);

  if (currentSettings.profileOn) {
    preloadOn = true;
    preloadSec = Math.max(0.2, preloadSec || 0.2);
  }

  if (preloadOn && preloadSec > 0) {
    await runCountdown(preloadSec);
  }

  if (blocked) return;

  const exitTime = now();
  const log = {
    t: entryStart,
    exitedAt: exitTime,
    clientKey,
    ip: ipInfo.ip,
    continent: ipInfo.continent,
    country: ipInfo.country,
    city: ipInfo.city,
    coordinates: (ipInfo.latitude && ipInfo.longitude) ? `${ipInfo.latitude}, ${ipInfo.longitude}` : null,
    vpn: ipInfo.vpn,
    deviceName: deviceInfo.deviceName,
    deviceType: deviceInfo.deviceType,
    browserType: deviceInfo.browserType,
    enterNumber,
    permissions: permissions.length ? permissions : ['None'],
    ua: navigator.userAgent,
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    ref: document.referrer || "",
    timeOnPageMs: exitTime - entryStart,
    note: ""
  };

  if (currentSettings.autoRedirect) {
    await doRedirect(code, link.url, log, currentSettings.hooksOn ? currentSettings.webhooks : []);
  } else {
    $("redirBtn").classList.remove("hidden");
    $("redirBtn").onclick = async () => {
      if (blocked) return;
      $("redirBtn").disabled = true;
      log.exitedAt = now();
      log.timeOnPageMs = log.exitedAt - entryStart;
      await doRedirect(code, link.url, log, currentSettings.hooksOn ? currentSettings.webhooks : []);
    };
  }
}

boot().catch(e => {
  console.error(e);
  redirError("error: runtime failure");
});
