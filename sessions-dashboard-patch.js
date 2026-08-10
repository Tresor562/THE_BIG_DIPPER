'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const serverPath = path.join(BOT, 'api', 'server.js');
const appPath = path.join(BOT, 'public', 'js', 'app.js');
const htmlPath = path.join(BOT, 'public', 'index.html');
const cssPath = path.join(BOT, 'public', 'css', 'style.css');

for (const file of [serverPath, appPath, htmlPath, cssPath]) {
  if (!fs.existsSync(file)) throw new Error(`[sessions-dashboard] fichier absent: ${file}`);
}

function replaceOnce(file, search, replacement, label) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(replacement)) {
    console.log(`[sessions-dashboard] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[sessions-dashboard] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  fs.writeFileSync(file, src);
  console.log(`[sessions-dashboard] ${label} appliqué`);
}

// ── API : exposer uniquement les sessions RÉELLEMENT en ligne ────────────
replaceOnce(
  serverPath,
  "const sessionManager = require('../utils/sessionManager');",
  "const sessionManager = require('../utils/sessionManager');\nconst sessionIndex = require('../utils/sessionIndex');",
  'import sessionIndex'
);

const apiAnchor = `/**\n * POST /session/stop`;
const apiBlock = `/**\n * GET /sessions/active\n *\n * Tableau public minimal pour le site : uniquement les sessions réellement\n * en ligne dans sessionManager. Les numéros sont masqués et owner/sessionId\n * complets ne sont jamais exposés. L'origine vient de sessions_index Mongo.\n */\nfunction maskSessionPhone(value) {\n  const digits = String(value || '').replace(/\\D/g, '');\n  if (!digits) return 'Compte WhatsApp';\n  if (digits.length <= 6) return '+' + digits.slice(0, 2) + '••' + digits.slice(-2);\n  return '+' + digits.slice(0, 3) + '••••' + digits.slice(-4);\n}\n\nfunction normalizeSessionOrigin(value) {\n  const raw = String(value || 'unknown').trim().toLowerCase();\n  if (raw === 'web' || raw === 'website' || raw === 'site') return 'website';\n  if (raw === 'telegram' || raw === 'tg') return 'telegram';\n  if (raw === 'whatsapp' || raw === 'wa') return 'whatsapp';\n  if (raw === 'api') return 'api';\n  return 'unknown';\n}\n\nasync function handleActiveSessionsRoute(req, res) {\n  let runtimeSessions = [];\n  try { runtimeSessions = sessionManager.getAllSessions() || []; } catch (_) {}\n\n  let metas = [];\n  try { metas = await sessionIndex.listSessions(); } catch (err) {\n    console.warn('[api] /sessions/active métadonnées Mongo indisponibles:', err.message);\n  }\n\n  const metaById = new Map((metas || []).map(meta => [String(meta.sessionId || meta._id || ''), meta]));\n  const counts = { website: 0, telegram: 0, whatsapp: 0, api: 0, unknown: 0 };\n\n  const sessions = runtimeSessions\n    .filter(session => session && session.isOnline === true)\n    .map(session => {\n      const meta = metaById.get(String(session.sessionId || '')) || {};\n      const origin = normalizeSessionOrigin(meta.origin);\n      if (Object.prototype.hasOwnProperty.call(counts, origin)) counts[origin] += 1;\n      else counts.unknown += 1;\n\n      return {\n        phone: maskSessionPhone(session.phoneNumber),\n        origin,\n        isOnline: true,\n        isRegistered: !!session.isRegistered,\n        lastActivity: meta.lastActivity || null,\n      };\n    })\n    .sort((a, b) => String(a.origin).localeCompare(String(b.origin)) || String(a.phone).localeCompare(String(b.phone)));\n\n  res.setHeader('Cache-Control', 'no-store, max-age=0');\n  return sendJSON(res, 200, {\n    total: sessions.length,\n    counts,\n    sessions,\n    generatedAt: new Date().toISOString(),\n  });\n}\n\n`;

replaceOnce(
  serverPath,
  apiAnchor,
  apiBlock + apiAnchor,
  'route active sessions handler'
);

replaceOnce(
  serverPath,
  `      if (req.method === 'GET' && url.pathname === '/session/status') {\n        return handleSessionStatusRoute(req, res, url.searchParams);\n      }`,
  `      if (req.method === 'GET' && url.pathname === '/session/status') {\n        return handleSessionStatusRoute(req, res, url.searchParams);\n      }\n      if (req.method === 'GET' && url.pathname === '/sessions/active') {\n        return await handleActiveSessionsRoute(req, res);\n      }`,
  'route GET /sessions/active'
);

// ── FRONT : marquer correctement les nouveaux pairings du site ──────────
replaceOnce(
  appPath,
  "      body: JSON.stringify({ phoneNumber: phoneNumber }),",
  "      body: JSON.stringify({ phoneNumber: phoneNumber, origin: 'website' }),",
  'origin website sur /pair'
);

// ── FRONT : récupérer les vraies sessions et rafraîchir les compteurs ───
const appTail = `  })();\n})();`;
const sessionsJs = `  })();\n\n  // ══════════════════════════════════════════════════════════════════\n  // Active sessions — données réelles depuis le backend WhatsApp\n  // ══════════════════════════════════════════════════════════════════\n  var sessionsListEl = document.getElementById('sessions-list');\n  var sessionsStatusEl = document.getElementById('sessions-status');\n\n  function setStat(name, value) {\n    var el = document.querySelector('[data-stat="' + name + '"]');\n    if (el) el.textContent = String(value);\n  }\n\n  function originLabel(origin) {\n    if (origin === 'website') return 'Website';\n    if (origin === 'telegram') return 'Telegram';\n    if (origin === 'whatsapp') return 'WhatsApp';\n    if (origin === 'api') return 'API / legacy';\n    return 'Unknown';\n  }\n\n  function originIcon(origin) {\n    if (origin === 'website') return '🌐';\n    if (origin === 'telegram') return '🤖';\n    if (origin === 'whatsapp') return '💬';\n    if (origin === 'api') return '🔌';\n    return '◌';\n  }\n\n  function renderActiveSessions(data) {\n    var counts = (data && data.counts) || {};\n    var sessions = (data && Array.isArray(data.sessions)) ? data.sessions : [];\n\n    setStat('web', counts.website || 0);\n    setStat('telegram', counts.telegram || 0);\n    setStat('whatsapp', counts.whatsapp || 0);\n    setStat('total', data && typeof data.total === 'number' ? data.total : sessions.length);\n\n    if (!sessionsListEl) return;\n    sessionsListEl.textContent = '';\n\n    if (!sessions.length) {\n      var empty = document.createElement('p');\n      empty.className = 'sessions-empty';\n      empty.textContent = 'No WhatsApp session is currently online.';\n      sessionsListEl.appendChild(empty);\n      return;\n    }\n\n    sessions.forEach(function (session) {\n      var row = document.createElement('div');\n      row.className = 'session-row';\n\n      var left = document.createElement('div');\n      left.className = 'session-row__identity';\n\n      var dot = document.createElement('span');\n      dot.className = 'session-row__dot';\n      dot.setAttribute('aria-label', 'Online');\n\n      var phone = document.createElement('span');\n      phone.className = 'session-row__phone';\n      phone.textContent = session.phone || 'WhatsApp account';\n\n      left.appendChild(dot);\n      left.appendChild(phone);\n\n      var badge = document.createElement('span');\n      badge.className = 'session-row__origin session-row__origin--' + (session.origin || 'unknown');\n      badge.textContent = originIcon(session.origin) + ' ' + originLabel(session.origin);\n\n      row.appendChild(left);\n      row.appendChild(badge);\n      sessionsListEl.appendChild(row);\n    });\n  }\n\n  function loadActiveSessions() {\n    fetch(API_BASE_URL + '/sessions/active', {\n      method: 'GET',\n      headers: { 'Accept': 'application/json' },\n      cache: 'no-store'\n    })\n      .then(function (res) {\n        if (!res.ok) throw new Error('HTTP ' + res.status);\n        return res.json();\n      })\n      .then(function (data) {\n        renderActiveSessions(data);\n        if (sessionsStatusEl) sessionsStatusEl.textContent = 'Live';\n      })\n      .catch(function () {\n        if (sessionsStatusEl) sessionsStatusEl.textContent = 'Unavailable';\n      });\n  }\n\n  loadActiveSessions();\n  var sessionsRefreshTimer = setInterval(loadActiveSessions, 15000);\n  if (document.addEventListener) {\n    document.addEventListener('visibilitychange', function () {\n      if (!document.hidden) loadActiveSessions();\n    });\n  }\n\n})();`;

replaceOnce(appPath, appTail, sessionsJs, 'frontend live sessions');

// ── HTML : remplacer les placeholders par une zone réellement alimentée ─
replaceOnce(
  htmlPath,
  `    <!-- ── Active sessions — UI ready to receive live data via API; no API for this aggregate exists yet, so values stay as placeholders ── -->`,
  `    <!-- ── Active sessions — données réelles depuis GET /sessions/active ── -->`,
  'commentaire sessions'
);
replaceOnce(
  htmlPath,
  `      <p class="section__hint">Live counts by origin — connects automatically once the API exposes them.</p>`,
  `      <p class="section__hint">WhatsApp sessions currently online, grouped by their real connection origin. <span id="sessions-status" class="sessions-live-status">Loading…</span></p>`,
  'hint sessions'
);
replaceOnce(
  htmlPath,
  `      <p class="stats__total">Total active: <strong data-stat="total">—</strong></p>`,
  `      <p class="stats__total">Total active: <strong data-stat="total">—</strong></p>\n      <div class="sessions-list" id="sessions-list" aria-live="polite"></div>`,
  'liste sessions'
);

// ── CSS : lignes compactes, responsive, sans exposer de données sensibles ─
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('/* ── Live sessions dashboard ── */')) {
  css += `\n\n/* ── Live sessions dashboard ── */\n.sessions-live-status{\n  display: inline-flex;\n  align-items: center;\n  margin-left: 6px;\n  color: var(--success);\n  font-size: .76rem;\n  font-family: var(--font-mono);\n}\n.sessions-list{\n  width: min(560px, 100%);\n  margin: 16px auto 0;\n  display: grid;\n  gap: 8px;\n}\n.session-row{\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 11px 12px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-sm);\n  background: rgba(16, 20, 44, .72);\n}\n.session-row__identity{\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  gap: 9px;\n}\n.session-row__dot{\n  width: 8px;\n  height: 8px;\n  flex: 0 0 8px;\n  border-radius: 50%;\n  background: var(--success);\n  box-shadow: 0 0 12px rgba(78, 230, 184, .65);\n}\n.session-row__phone{\n  min-width: 0;\n  font-family: var(--font-mono);\n  font-size: .84rem;\n  color: var(--ink);\n  white-space: nowrap;\n}\n.session-row__origin{\n  flex: 0 0 auto;\n  padding: 5px 8px;\n  border: 1px solid var(--border);\n  border-radius: 999px;\n  font-size: .7rem;\n  color: var(--ink-dim);\n  background: var(--surface-2);\n}\n.sessions-empty{\n  padding: 12px;\n  text-align: center;\n  color: var(--ink-faint);\n  font-size: .82rem;\n}\n@media (max-width: 420px){\n  .session-row{ align-items: flex-start; flex-direction: column; }\n  .session-row__origin{ margin-left: 17px; }\n}\n`;
  fs.writeFileSync(cssPath, css);
  console.log('[sessions-dashboard] CSS sessions ajouté');
}

// ── Validation build ─────────────────────────────────────────────────────
for (const file of [serverPath, appPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[sessions-dashboard] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalServer = fs.readFileSync(serverPath, 'utf8');
const finalApp = fs.readFileSync(appPath, 'utf8');
const finalHtml = fs.readFileSync(htmlPath, 'utf8');
if (!finalServer.includes("url.pathname === '/sessions/active'")) throw new Error('[sessions-dashboard] route active absente');
if (!finalApp.includes("origin: 'website'")) throw new Error('[sessions-dashboard] origin website absent');
if (!finalApp.includes("'/sessions/active'")) throw new Error('[sessions-dashboard] fetch active absent');
if (!finalHtml.includes('id="sessions-list"')) throw new Error('[sessions-dashboard] liste HTML absente');

console.log('[sessions-dashboard] ✅ sessions en ligne + origines réelles reliées au site');
