'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[pairing-handshake] bot/ absent — sous-module non cloné.');

function filePath(rel) { return path.join(BOT, rel); }
function read(rel) { return fs.readFileSync(filePath(rel), 'utf8'); }
function write(rel, src) { fs.writeFileSync(filePath(rel), src, 'utf8'); }

function replaceOnce(rel, search, replacement, marker, label) {
  let src = read(rel);
  if (marker && src.includes(marker)) {
    console.log(`[pairing-handshake] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[pairing-handshake] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  write(rel, src);
  console.log(`[pairing-handshake] ${label} appliqué`);
}

function replaceRegexOnce(rel, re, replacement, marker, label) {
  let src = read(rel);
  if (marker && src.includes(marker)) {
    console.log(`[pairing-handshake] ${label} déjà appliqué`);
    return;
  }
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const matches = [...src.matchAll(new RegExp(re.source, flags))];
  if (matches.length !== 1) throw new Error(`[pairing-handshake] ${label}: attendu 1 occurrence regex, trouvé ${matches.length}`);
  src = src.replace(re, replacement);
  write(rel, src);
  console.log(`[pairing-handshake] ${label} appliqué`);
}

function insertBefore(rel, anchor, block, marker, label) {
  let src = read(rel);
  if (marker && src.includes(marker)) {
    console.log(`[pairing-handshake] ${label} déjà appliqué`);
    return;
  }
  const idx = src.indexOf(anchor);
  if (idx < 0) throw new Error(`[pairing-handshake] ${label}: ancre absente`);
  if (src.indexOf(anchor, idx + anchor.length) >= 0) throw new Error(`[pairing-handshake] ${label}: ancre non unique`);
  src = src.slice(0, idx) + block + src.slice(idx);
  write(rel, src);
  console.log(`[pairing-handshake] ${label} appliqué`);
}

function nodeCheck(rel) {
  const result = spawnSync(process.execPath, ['--check', filePath(rel)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`[pairing-handshake] syntaxe invalide ${rel}: ${result.stderr || result.stdout}`);
}

// 1) sessionManager : attendre la vraie readiness de pairing (QR event)
const sessionRel = 'utils/sessionManager.js';

replaceRegexOnce(
  sessionRel,
  /(\s+isStopping:\s*false,\n)(\s+heartbeatFailures:)/,
  `$1    latestPairingQr: null, // [PAIRING READINESS STATE]\n    pairingQrSeenAt: 0,\n    pairingRequestedAt: 0,\n    pairingState: state.creds.registered ? 'registered' : 'starting',\n    pairingFailure: null,\n$2`,
  '[PAIRING READINESS STATE]',
  'état pairing par socket'
);

replaceOnce(
  sessionRel,
  "    const { connection, lastDisconnect, isNewLogin } = update;",
  `    const { connection, lastDisconnect, isNewLogin, qr } = update;\n\n    // [PAIRING QR READY]\n    // L'exemple officiel Baileys demande le pairing code à partir de l'événement\n    // QR. On mémorise donc la readiness au lieu de dépendre d'un délai arbitraire.\n    if (qr && !session.isOnline) {\n      session.latestPairingQr = qr;\n      session.pairingQrSeenAt = Date.now();\n      if (session.pairingState === 'starting') session.pairingState = 'ready';\n    }`,
  '[PAIRING QR READY]',
  'readiness QR mémorisée'
);

replaceOnce(
  sessionRel,
  "      const errorMessage = lastDisconnect?.error?.message || 'inconnue';",
  `      const errorMessage = lastDisconnect?.error?.message || 'inconnue';\n\n      if (opts.isPairing && session.pairingState !== 'linked') {\n        session.pairingState = 'failed'; // [PAIRING FAILURE DIAGNOSTIC]\n        session.pairingFailure = {\n          statusCode: statusCode ?? null,\n          message: errorMessage,\n          at: Date.now(),\n        };\n        logCriticalSessionError(\n          \`🔐 \${sessionId} pairing interrompu — code=\${statusCode ?? '?'} — \${errorMessage}\`\n        );\n      }`,
  '[PAIRING FAILURE DIAGNOSTIC]',
  'diagnostic échec pairing'
);

replaceOnce(
  sessionRel,
  "      session.isOnline = true;",
  `      session.isOnline = true;\n      session.pairingState = 'linked'; // [PAIRING LINKED STATE]\n      session.pairingFailure = null;\n      session.latestPairingQr = null;`,
  '[PAIRING LINKED STATE]',
  'état pairing lié à ouverture'
);

replaceRegexOnce(
  sessionRel,
  /    if \(update\?\.registered === true \|\| state\.creds\?\.registered === true\) \{\n      session\.isRegistered = true;\n      sessionIndex\.setState\(sessionId, \{ isRegistered: true \}\)\.catch\(\(\) => \{\}\);\n    \}/,
  `    if ((update?.registered === true || state.creds?.registered === true) && session.isOnline) {\n      // [PAIRING REGISTERED AFTER OPEN]\n      session.isRegistered = true;\n      sessionIndex.setState(sessionId, { isRegistered: true }).catch(() => {});\n    } else if (update?.registered === true && !session.isOnline && opts.isPairing) {\n      session.pairingState = session.pairingState === 'code-issued'\n        ? 'code-issued'\n        : 'credentials-prepared';\n    }`,
  '[PAIRING REGISTERED AFTER OPEN]',
  'registered confirmé seulement après open'
);

const readinessHelper = `// [PAIRING READINESS WAIT]\nfunction waitForPairingQr(phoneNumber, timeoutMs = 20_000) {\n  const sessionId = toSessionId(phoneNumber);\n  const session = activeSessions.get(sessionId);\n  if (!session) return Promise.reject(new Error(\`Aucune session active pour \${sessionId}\`));\n  if (session.latestPairingQr) return Promise.resolve(session.latestPairingQr);\n\n  return new Promise((resolve, reject) => {\n    let timer = null;\n\n    const cleanup = () => {\n      if (timer) clearTimeout(timer);\n      try { session.sock?.ev?.off?.('connection.update', onUpdate); } catch (_) {}\n      try { session.sock?.ev?.removeListener?.('connection.update', onUpdate); } catch (_) {}\n    };\n\n    const onUpdate = (update = {}) => {\n      if (update.qr) {\n        session.latestPairingQr = update.qr;\n        session.pairingQrSeenAt = Date.now();\n        if (session.pairingState === 'starting') session.pairingState = 'ready';\n        cleanup();\n        return resolve(update.qr);\n      }\n      if (update.connection === 'close') {\n        const code = update.lastDisconnect?.error?.output?.statusCode;\n        const message = update.lastDisconnect?.error?.message || 'connexion fermée';\n        cleanup();\n        return reject(new Error(\`Socket fermé avant readiness pairing (code=\${code ?? '?'}) — \${message}\`));\n      }\n    };\n\n    session.sock.ev.on('connection.update', onUpdate);\n    timer = setTimeout(() => {\n      cleanup();\n      reject(new Error(\`Pairing non prêt après \${Math.round(timeoutMs / 1000)}s (aucun événement QR)\`));\n    }, timeoutMs);\n    if (timer.unref) timer.unref();\n  });\n}\n\n`;

insertBefore(
  sessionRel,
  'function withTimeout(promise, ms, label) {',
  readinessHelper,
  '[PAIRING READINESS WAIT]',
  'helper attente readiness pairing'
);

replaceRegexOnce(
  sessionRel,
  /  \/\/ Petit délai de grâce pour laisser le socket terminer sa poignée de main[\s\S]*?  const timeoutMs = opts\.timeoutMs \?\? 20000;/,
  `  // [PAIRING REQUEST AFTER QR]\n  const readinessTimeoutMs = opts.readinessTimeoutMs ?? 20_000;\n  await waitForPairingQr(phoneNumber, readinessTimeoutMs);\n  session.pairingRequestedAt = Date.now();\n  session.pairingState = 'requesting-code';\n\n  const timeoutMs = opts.timeoutMs ?? 20000;`,
  '[PAIRING REQUEST AFTER QR]',
  'requestPairingCode après QR'
);

replaceOnce(
  sessionRel,
  "  const code = raw?.match(/.{1,4}/g)?.join('-') || raw || '????-????';",
  `  const rawCode = String(raw || '').replace(/[^0-9A-Za-z]/g, '');\n  if (rawCode.length < 6) throw new Error('Code de pairing invalide retourné par WhatsApp');\n  session.pairingCodeRaw = rawCode; // [PAIRING RAW CODE]\n  session.pairingState = 'code-issued';\n  const code = rawCode.match(/.{1,4}/g)?.join('-') || rawCode;`,
  '[PAIRING RAW CODE]',
  'code brut conservé'
);

replaceOnce(
  sessionRel,
  "  requestPairingCode,\n  startOrphanSessionSweep,",
  "  requestPairingCode,\n  waitForPairingQr,\n  startOrphanSessionSweep,",
  '  waitForPairingQr,',
  'export waitForPairingQr'
);

// 2) pairingService : vrai fallback QR sans requestPairingCode()
const pairingRel = 'utils/pairingService.js';

const qrPairingFunction = `/**\n * [PAIRING QR FALLBACK]\n * Alternative au pairing-code lorsque WhatsApp refuse le code.\n */\nasync function createQrPairingSession(phoneNumber, options = {}) {\n  if (!process.env.MONGODB_URI) {\n    throw new PairingError('NO_MONGODB', 'MONGODB_URI manquant — le Pairing Service nécessite le mode multi-session.');\n  }\n\n  const owner = options.owner || options.requesterKey || 'unknown';\n  const origin = options.origin || 'website-qr';\n  const cleanNumber = normalizeNumber(phoneNumber);\n\n  if (!cleanNumber || cleanNumber.length < 7 || cleanNumber.length > 15) {\n    throw new PairingError('INVALID_NUMBER', 'Numéro invalide.');\n  }\n\n  const qrCooldownKey = options.requesterKey ? \`qr:\${options.requesterKey}\` : null;\n  const waitSec = checkAndSetCooldown(qrCooldownKey);\n  if (waitSec > 0) {\n    throw new PairingError('COOLDOWN', \`Merci de patienter \${waitSec}s avant une nouvelle demande QR.\`);\n  }\n\n  const sessionId = sessionManager.toSessionId(cleanNumber);\n  const existing = sessionManager.getSession(cleanNumber);\n  if (existing?.isOnline) {\n    return { sessionId, qr: null, reconnected: true };\n  }\n\n  let db;\n  try {\n    db = await mongoClient.getDb();\n  } catch (err) {\n    throw new PairingError('DB_UNAVAILABLE', \`Connexion à la base de données impossible : \${err.message}\`);\n  }\n\n  let session = existing;\n  if (session?.isRegistered) {\n    const online = await waitForSessionOnline(cleanNumber, 6_000);\n    if (online) return { sessionId, qr: null, reconnected: true };\n    try {\n      session = await resetDisconnectedRegisteredSession(db, cleanNumber, { owner, origin });\n    } catch (err) {\n      throw new PairingError('CODE_FAILED', \`Échec de préparation QR : \${err.message}\`);\n    }\n  } else {\n    if (session) {\n      try { await sessionManager.stopSession(cleanNumber); } catch (_) {}\n    }\n    try { await clearPersistentAuth(db, sessionId); } catch (_) {}\n    try {\n      await sessionIndex.setState(sessionId, { isOnline: false, isRegistered: false });\n    } catch (_) {}\n\n    try {\n      session = await sessionManager.startSession(db, cleanNumber, {\n        isPairing: true,\n        owner,\n        origin,\n      });\n    } catch (err) {\n      throw new PairingError('CODE_FAILED', \`Échec de création de la session QR : \${err.message}\`);\n    }\n  }\n\n  try {\n    const qr = await sessionManager.waitForPairingQr(cleanNumber, 20_000);\n    session.pairingState = 'qr-issued';\n    return { sessionId, qr, reconnected: false };\n  } catch (err) {\n    try { await sessionManager.stopSession(cleanNumber); } catch (_) {}\n    throw new PairingError('CODE_FAILED', \`QR indisponible : \${err.message}\`);\n  }\n}\n\n`;

insertBefore(
  pairingRel,
  'module.exports = {',
  qrPairingFunction,
  '[PAIRING QR FALLBACK]',
  'service fallback QR'
);

replaceOnce(
  pairingRel,
  "  createPairingSession,\n  PairingError,",
  "  createPairingSession,\n  createQrPairingSession,\n  PairingError,",
  '  createQrPairingSession,',
  'export fallback QR'
);

// 3) API : POST /pair/qr → QR data URL
const apiRel = 'api/server.js';

replaceOnce(
  apiRel,
  "const { createPairingSession, PairingError } = require('../utils/pairingService');",
  `const { createPairingSession, createQrPairingSession, PairingError } = require('../utils/pairingService');\nconst QRCode = require('qrcode'); // [PAIRING QR API]`,
  '[PAIRING QR API]',
  'imports API QR'
);

const qrRoute = `/**\n * [PAIRING QR ROUTE]\n * POST /pair/qr\n */\nasync function handlePairQrRoute(req, res) {\n  let body;\n  try {\n    body = await readJsonBody(req);\n  } catch (err) {\n    return sendJSON(res, err.statusCode || 400, { error: 'BAD_REQUEST', message: err.message });\n  }\n\n  const phoneNumber = body?.phoneNumber;\n  if (!phoneNumber) {\n    return sendJSON(res, 400, {\n      error: 'MISSING_PHONE_NUMBER',\n      message: 'Le champ "phoneNumber" est requis dans le corps JSON.',\n    });\n  }\n\n  const requesterKey = getClientIp(req);\n  const origin = (typeof body?.origin === 'string' && body.origin.trim()) || 'website-qr';\n  const owner = (typeof body?.owner === 'string' && body.owner.trim()) || requesterKey;\n\n  try {\n    const result = await createQrPairingSession(phoneNumber, { requesterKey, origin, owner });\n    if (result.reconnected) return sendJSON(res, 200, result);\n\n    const qrDataUrl = await QRCode.toDataURL(result.qr, {\n      width: 360,\n      margin: 2,\n      errorCorrectionLevel: 'M',\n    });\n    return sendJSON(res, 200, {\n      sessionId: result.sessionId,\n      reconnected: false,\n      qrDataUrl,\n    });\n  } catch (err) {\n    if (err instanceof PairingError) {\n      const status = ERROR_STATUS[err.code] || 400;\n      return sendJSON(res, status, { error: err.code, message: err.message });\n    }\n    console.error('[api] /pair/qr erreur inattendue:', err);\n    return sendJSON(res, 500, { error: 'INTERNAL_ERROR', message: 'Erreur interne.' });\n  }\n}\n\n`;

insertBefore(
  apiRel,
  '/**\n * GET /session/status',
  qrRoute,
  '[PAIRING QR ROUTE]',
  'route API QR'
);

replaceOnce(
  apiRel,
  `      if (req.method === 'POST' && url.pathname === '/pair') {\n        return await handlePairRoute(req, res);\n      }`,
  `      if (req.method === 'POST' && url.pathname === '/pair') {\n        return await handlePairRoute(req, res);\n      }\n      if (req.method === 'POST' && url.pathname === '/pair/qr') { // [PAIRING QR ROUTE WIRE]\n        return await handlePairQrRoute(req, res);\n      }`,
  '[PAIRING QR ROUTE WIRE]',
  'route QR branchée'
);

// 4) Frontend : copie sans tiret + fallback QR
const appRel = 'public/js/app.js';

replaceOnce(
  appRel,
  "  var stateReconnected = document.getElementById('state-reconnected');",
  `  var stateReconnected = document.getElementById('state-reconnected');\n  var stateQr = document.getElementById('state-qr'); // [PAIRING QR UI]\n  var qrImage = document.getElementById('qr-image');\n  var qrFallbackBtn = document.getElementById('qr-fallback-btn');\n  var qrRefreshBtn = document.getElementById('qr-refresh-btn');\n  var restartBtnQr = document.getElementById('restart-btn-qr');\n  var lastPhoneNumber = '';`,
  '[PAIRING QR UI]',
  'variables UI QR'
);

replaceOnce(
  appRel,
  "    stateReconnected.hidden = name !== 'reconnected';",
  `    stateReconnected.hidden = name !== 'reconnected';\n    stateQr.hidden = name !== 'qr';`,
  "stateQr.hidden = name !== 'qr';",
  'état QR dans showState'
);

replaceOnce(
  appRel,
  "    phoneInputEl.focus();",
  `    lastPhoneNumber = '';\n    if (qrImage) qrImage.removeAttribute('src');\n    phoneInputEl.focus();`,
  "lastPhoneNumber = '';",
  'reset QR et numéro'
);

replaceRegexOnce(
  appRel,
  /  function formatCode\(code\) \{[\s\S]*?  \}\n\n  form\.addEventListener/,
  `  function formatCode(code) {\n    // [PAIRING RAW COPY]\n    var raw = String(code || '').replace(/[^0-9A-Za-z]/g, '');\n    return raw.match(/.{1,4}/g)?.join(' ') || raw;\n  }\n\n  form.addEventListener`,
  '[PAIRING RAW COPY]',
  'format code sans tiret'
);

replaceOnce(
  appRel,
  "  function submitPairingRequest(phoneNumber) {\n    setLoading(true);",
  `  function submitPairingRequest(phoneNumber) {\n    lastPhoneNumber = phoneNumber; // [PAIRING PHONE REMEMBER]\n    setLoading(true);`,
  '[PAIRING PHONE REMEMBER]',
  'numéro mémorisé pour fallback'
);

replaceOnce(
  appRel,
  "    var code = codeValueEl.textContent;\n    copyText(code).then(function () {",
  `    var code = String(codeValueEl.textContent || '').replace(/[^0-9A-Za-z]/g, ''); // [PAIRING COPY CLEAN]\n    copyText(code).then(function () {`,
  '[PAIRING COPY CLEAN]',
  'copie code brut'
);

const qrUiLogic = `  // [PAIRING QR FALLBACK UI]\n  function requestQrFallback() {\n    if (!lastPhoneNumber) {\n      showToast('Enter your phone number again before generating a QR code.');\n      return;\n    }\n\n    if (qrFallbackBtn) qrFallbackBtn.disabled = true;\n    if (qrRefreshBtn) qrRefreshBtn.disabled = true;\n\n    fetch(API_BASE_URL + '/pair/qr', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ phoneNumber: lastPhoneNumber, origin: 'website-qr' }),\n    })\n      .then(function (res) {\n        return res.json().then(function (data) {\n          return { ok: res.ok, data: data, parsed: true };\n        }).catch(function () {\n          return { ok: res.ok, data: null, parsed: false };\n        });\n      })\n      .then(function (result) {\n        if (!result.parsed) {\n          showToast(friendlyMessage('BAD_RESPONSE'));\n          return;\n        }\n        if (!result.ok || !result.data) {\n          showToast(friendlyMessage(result.data && result.data.error, result.data && result.data.message));\n          return;\n        }\n        if (result.data.reconnected) {\n          showState('reconnected');\n          return;\n        }\n        if (!result.data.qrDataUrl) {\n          showToast('QR code unavailable. Please try again.');\n          return;\n        }\n        qrImage.src = result.data.qrDataUrl;\n        showState('qr');\n      })\n      .catch(function () {\n        showToast(friendlyMessage('NETWORK'));\n      })\n      .finally(function () {\n        if (qrFallbackBtn) qrFallbackBtn.disabled = false;\n        if (qrRefreshBtn) qrRefreshBtn.disabled = false;\n      });\n  }\n\n  if (qrFallbackBtn) qrFallbackBtn.addEventListener('click', requestQrFallback);\n  if (qrRefreshBtn) qrRefreshBtn.addEventListener('click', requestQrFallback);\n  if (restartBtnQr) restartBtnQr.addEventListener('click', resetToForm);\n\n`;

insertBefore(
  appRel,
  '  // ══════════════════════════════════════════════════════════════════\n  // Logo — round image before the brand name.',
  qrUiLogic,
  '[PAIRING QR FALLBACK UI]',
  'logique frontend fallback QR'
);

const htmlRel = 'public/index.html';

replaceOnce(
  htmlRel,
  `        <button type="button" class="btn btn--ghost" id="restart-btn">Link another number</button>`,
  `        <button type="button" class="btn btn--primary" id="qr-fallback-btn">Pair with QR instead</button>\n        <p class="card__hint pairing-fallback-hint">If WhatsApp says it can't link the device with the code, use QR. Open this page on another screen if needed.</p>\n        <button type="button" class="btn btn--ghost" id="restart-btn">Link another number</button>`,
  'id="qr-fallback-btn"',
  'bouton fallback QR'
);

const qrHtml = `      <!-- ── STATE: QR FALLBACK ───────────────────────────────────────── -->\n      <section class="state state--qr" id="state-qr" hidden aria-labelledby="qr-heading">\n        <h2 id="qr-heading" class="card__heading">Scan to link</h2>\n        <p class="card__hint">Open WhatsApp → Linked devices → Link a device, then scan this QR code. Scan it quickly before it refreshes.</p>\n        <div class="qr-frame">\n          <img id="qr-image" alt="WhatsApp device linking QR code" />\n        </div>\n        <button type="button" class="btn btn--primary" id="qr-refresh-btn">Refresh QR</button>\n        <button type="button" class="btn btn--ghost" id="restart-btn-qr">Use another number</button>\n      </section>\n\n`;

insertBefore(
  htmlRel,
  '      <!-- ── STATE: ALREADY LINKED (reconnected) ─────────────────────── -->',
  qrHtml,
  'id="state-qr"',
  'état HTML QR'
);

replaceOnce(
  htmlRel,
  '<span class="code-display__value" id="code-value">0000-0000</span>',
  '<span class="code-display__value" id="code-value">0000 0000</span>',
  '>0000 0000</span>',
  'placeholder code sans tiret'
);

const cssRel = 'public/css/style.css';
let css = read(cssRel);
if (!css.includes('[PAIRING QR STYLE]')) {
  css += `\n\n/* [PAIRING QR STYLE] */\n.pairing-fallback-hint{\n  margin-top: .8rem;\n  margin-bottom: .8rem;\n  text-align: center;\n}\n.qr-frame{\n  width: min(360px, 86vw);\n  margin: 1.2rem auto;\n  padding: 12px;\n  border-radius: var(--radius-md);\n  background: #fff;\n  box-shadow: 0 18px 55px rgba(0,0,0,.32);\n}\n.qr-frame img{\n  display: block;\n  width: 100%;\n  aspect-ratio: 1 / 1;\n  object-fit: contain;\n}\n.state--qr .btn + .btn{\n  margin-top: .7rem;\n}\n`;
  write(cssRel, css);
  console.log('[pairing-handshake] style QR ajouté');
}

for (const rel of [sessionRel, pairingRel, apiRel, appRel]) nodeCheck(rel);
console.log('[pairing-handshake] ✅ readiness QR + pairing-code nettoyé + fallback QR installés');
