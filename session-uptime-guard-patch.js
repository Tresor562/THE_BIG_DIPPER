'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const sessionPath = path.join(BOT, 'utils', 'sessionManager.js');
const sessionIndexPath = path.join(BOT, 'utils', 'sessionIndex.js');
const indexPath = path.join(BOT, 'index.js');

for (const file of [sessionPath, sessionIndexPath, indexPath]) {
  if (!fs.existsSync(file)) throw new Error(`[session-uptime] fichier absent: ${file}`);
}

function replaceOnce(src, search, replacement, marker, label) {
  if (marker && src.includes(marker)) {
    console.log(`[session-uptime] ${label} déjà appliqué`);
    return src;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[session-uptime] ${label}: attendu 1 occurrence, trouvé ${count}`);
  }
  console.log(`[session-uptime] ${label} appliqué`);
  return src.replace(search, replacement);
}

function nodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`[session-uptime] syntaxe invalide ${path.relative(ROOT, file)}: ${result.stderr || result.stdout}`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 1) Etat persistant : distinguer "déconnecté transitoire" de "loggedOut".
// ───────────────────────────────────────────────────────────────────────────
let sessionIndex = fs.readFileSync(sessionIndexPath, 'utf8');

sessionIndex = replaceOnce(
  sessionIndex,
  "        state: { isOnline: false, isRegistered: false },",
  "        state: { isOnline: false, isRegistered: false, requiresPairing: false, lastDisconnectReason: null }, // [SESSION REPAIR STATE]",
  '[SESSION REPAIR STATE]',
  'état lifecycle persistant'
);

sessionIndex = replaceOnce(
  sessionIndex,
  "  if (typeof state.isRegistered === 'boolean') update['state.isRegistered'] = state.isRegistered;\n  await col.updateOne({ _id: sessionId }, { $set: update });",
  "  if (typeof state.isRegistered === 'boolean') update['state.isRegistered'] = state.isRegistered;\n  if (typeof state.requiresPairing === 'boolean') update['state.requiresPairing'] = state.requiresPairing; // [SESSION REPAIR STATE UPDATE]\n  if (typeof state.lastDisconnectReason === 'string' || state.lastDisconnectReason === null) update['state.lastDisconnectReason'] = state.lastDisconnectReason;\n  await col.updateOne({ _id: sessionId }, { $set: update });",
  '[SESSION REPAIR STATE UPDATE]',
  'setState étendu'
);

fs.writeFileSync(sessionIndexPath, sessionIndex, 'utf8');

// ───────────────────────────────────────────────────────────────────────────
// 2) Multi-session : watchdog, append/fromMe, reconciliation, fallback handler.
// ───────────────────────────────────────────────────────────────────────────
let session = fs.readFileSync(sessionPath, 'utf8');

const sessionHelpers = `// [SESSION UPTIME GUARD]
const SESSION_HEARTBEAT_MS = 30_000;
const SESSION_WATCHDOG_MS = 45_000;
const SESSION_HEARTBEAT_FAILURE_LIMIT = 3;
const SESSION_HEARTBEAT_STALE_MS = 150_000;
const SESSION_RECONCILE_MS = 15_000;

let _registeredSessionReconcilerTimer = null;
const _registeredSessionReconcileInFlight = new Set();

function _sessionWsState(sock) {
  return sock?.ws?.readyState ?? sock?.ws?.socket?.readyState ?? null;
}

function _sessionMessageText(msg) {
  let m = msg?.message || {};
  for (let i = 0; i < 4; i++) {
    if (m?.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
    if (m?.viewOnceMessage?.message) { m = m.viewOnceMessage.message; continue; }
    if (m?.viewOnceMessageV2?.message) { m = m.viewOnceMessageV2.message; continue; }
    if (m?.viewOnceMessageV2Extension?.message) { m = m.viewOnceMessageV2Extension.message; continue; }
    break;
  }
  return String(
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    m?.buttonsResponseMessage?.selectedButtonId ||
    m?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m?.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

function _isExplicitSessionCommand(msg) {
  const prefix = String(config.prefix || '.');
  return _sessionMessageText(msg).trim().startsWith(prefix);
}

async function _sendSessionHandlerFailureFallback(sock, jid, msg) {
  if (!jid || !_isExplicitSessionCommand(msg)) return;
  const payload = {
    text: '⚠️ *Commande reçue, mais son exécution a rencontré une erreur temporaire.*\\n\\nRéessaie dans quelques secondes.'
  };
  try {
    await sock.sendMessage(jid, payload, { quoted: msg });
  } catch (_) {
    try { await sock.sendMessage(jid, payload); } catch (_) {}
  }
}

async function _hasRecoverableSessionAuth(db, sessionId) {
  try {
    if (typeof hasMongoAuthState === 'function') {
      return !!(await hasMongoAuthState(db, sessionId));
    }
  } catch (_) {
    return false;
  }
  try { return !!sessionDirExists(sessionId); } catch (_) { return false; }
}
`;

session = replaceOnce(
  session,
  "const activeSessions = new Map();",
  "const activeSessions = new Map();\n\n" + sessionHelpers,
  '[SESSION UPTIME GUARD]',
  'helpers uptime multi-session'
);

session = replaceOnce(
  session,
  "    isStopping: false,\n    createdAt: Date.now(),",
  "    isStopping: false,\n    heartbeatFailures: 0, // [SESSION UPTIME STATE]\n    lastHeartbeatOkAt: Date.now(),\n    recoveryInFlight: false,\n    createdAt: Date.now(),",
  '[SESSION UPTIME STATE]',
  'état watchdog par session'
);

session = replaceOnce(
  session,
  "      session.isOnline = false;\n      _clearSessionTimers(session);",
  "      session.isOnline = false;\n      session.recoveryInFlight = false; // [SESSION CLOSE RESET]\n      _clearSessionTimers(session);",
  '[SESSION CLOSE RESET]',
  'reset watchdog à la fermeture'
);

session = replaceOnce(
  session,
  "      sessionIndex.setState(sessionId, { isOnline: true, isRegistered: true }).catch(() => {});",
  "      sessionIndex.setState(sessionId, { isOnline: true, isRegistered: true, requiresPairing: false, lastDisconnectReason: null }).catch(() => {}); // [SESSION OPEN REPAIR STATE]",
  '[SESSION OPEN REPAIR STATE]',
  'état enregistré à ouverture'
);

const oldHeartbeat = `      // ── Heartbeat ──────────────────────────────────────────────────────
      if (session.timers.heartbeat) clearInterval(session.timers.heartbeat);
      session.timers.heartbeat = setInterval(async () => {
        try { await sock.sendPresenceUpdate('available'); } catch {}
      }, 30000);`;

const newHeartbeat = `      // ── Heartbeat + watchdog actif ─────────────────────────────────────
      session.heartbeatFailures = 0;
      session.lastHeartbeatOkAt = Date.now();
      session.recoveryInFlight = false;

      if (session.timers.heartbeat) clearInterval(session.timers.heartbeat);
      session.timers.heartbeat = setInterval(async () => {
        try {
          await sock.sendPresenceUpdate('available');
          session.heartbeatFailures = 0;
          session.lastHeartbeatOkAt = Date.now();
        } catch (err) {
          session.heartbeatFailures += 1;
          if (session.heartbeatFailures >= SESSION_HEARTBEAT_FAILURE_LIMIT) {
            logCriticalSessionError(\`⚠️ \${sessionId} heartbeat échoué \${session.heartbeatFailures} fois — watchdog armé\`);
          }
        }
      }, SESSION_HEARTBEAT_MS);
      if (session.timers.heartbeat.unref) session.timers.heartbeat.unref();

      if (session.timers.monitor) clearInterval(session.timers.monitor);
      session.timers.monitor = setInterval(async () => {
        if (session.isStopping || !session.isOnline || session.recoveryInFlight) return;
        if (activeSessions.get(sessionId) !== session) return;

        const wsState = _sessionWsState(sock);
        const wsUnhealthy = wsState != null && wsState !== 1;
        const heartbeatStale =
          session.heartbeatFailures >= SESSION_HEARTBEAT_FAILURE_LIMIT ||
          (Date.now() - session.lastHeartbeatOkAt) > SESSION_HEARTBEAT_STALE_MS;

        if (!wsUnhealthy && !heartbeatStale) return;

        session.recoveryInFlight = true; // [SESSION SOCKET WATCHDOG]
        const reason = wsUnhealthy
          ? \`WebSocket state=\${wsState}\`
          : \`heartbeat stale/failures=\${session.heartbeatFailures}\`;
        logCriticalSessionError(\`♻️ \${sessionId} socket muet détecté (\${reason}) — recyclage automatique\`);
        sessionIndex.incrementStat(sessionId, 'reconnectCount').catch(() => {});

        try {
          await startSession(db, phoneNumber, {
            owner: opts.owner,
            origin: opts.origin,
            reconnectAttempts: Math.max(Number(session.reconnectAttempts) || 0, 1),
          });
        } catch (err) {
          session.recoveryInFlight = false;
          console.error(\`[SessionManager] ❌ watchdog recovery \${sessionId}:\`, err.message);
        }
      }, SESSION_WATCHDOG_MS);
      if (session.timers.monitor.unref) session.timers.monitor.unref();`;

session = replaceOnce(
  session,
  oldHeartbeat,
  newHeartbeat,
  '[SESSION SOCKET WATCHDOG]',
  'watchdog socket multi-session'
);

session = replaceOnce(
  session,
  "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify') return;",
  "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify' && type !== 'append') return; // [MULTI SESSION APPEND FROMME]",
  '[MULTI SESSION APPEND FROMME]',
  'append/fromMe multi-session'
);

session = replaceOnce(
  session,
  "    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;\n      const from = msg.key.remoteJid;",
  "    for (const msg of messages) {\n      if (type === 'append' && !msg.key?.fromMe) continue; // [MULTI SESSION APPEND FILTER]\n      if (!msg.message || !msg.key?.id) continue;\n      const from = msg.key.remoteJid;",
  '[MULTI SESSION APPEND FILTER]',
  'filtre append non-fromMe'
);

const oldHandlerCatch = `      } catch (err) {
        if (!err.message?.includes('rate-overlimit')) {
          console.error(\`[SessionManager] \${sessionId} handleMessage error:\`, err.message);
        }
      }`;
const newHandlerCatch = `      } catch (err) {
        // [SESSION HANDLER FAILURE FALLBACK]
        await _sendSessionHandlerFailureFallback(sock, from, msg);
        if (!err.message?.includes('rate-overlimit')) {
          console.error(\`[SessionManager] \${sessionId} handleMessage error:\`, err.message);
        }
      }`;

session = replaceOnce(
  session,
  oldHandlerCatch,
  newHandlerCatch,
  '[SESSION HANDLER FAILURE FALLBACK]',
  'fallback erreur handler multi-session'
);

session = replaceOnce(
  session,
  "    for (const meta of sessions) {\n      const phoneNumber = meta.phoneNumber || String(meta.sessionId).replace('session_', '');",
  "    for (const meta of sessions) {\n      if (meta.state?.requiresPairing === true) { // [SESSION LOAD LOGGEDOUT SKIP]\n        console.log(`[SessionManager] ⏭️ ${meta.sessionId} requiert un nouveau pairing — reconnexion automatique suspendue`);\n        continue;\n      }\n      const phoneNumber = meta.phoneNumber || String(meta.sessionId).replace('session_', '');",
  '[SESSION LOAD LOGGEDOUT SKIP]',
  'ne pas recharger loggedOut'
);

// Le bloc exact est installé plus tôt par install-session-lifecycle-cleanup.js.
session = replaceOnce(
  session,
  "          sessionIndex.setState(sessionId, { isOnline: false }).catch(() => {});\n        }\n      }",
  "          sessionIndex.setState(sessionId, { isOnline: false, isRegistered: false, requiresPairing: true, lastDisconnectReason: 'loggedOut' }).catch(() => {}); // [SESSION LOGGEDOUT STATE]\n        }\n      }",
  '[SESSION LOGGEDOUT STATE]',
  'loggedOut persistant'
);

const reconciler = `
// [REGISTERED SESSION RECONCILER]
function startRegisteredSessionReconciler(db, opts = {}) {
  if (_registeredSessionReconcilerTimer) return _registeredSessionReconcilerTimer;
  const intervalMs = Math.max(5_000, Number(opts.intervalMs) || SESSION_RECONCILE_MS);

  const reconcile = async () => {
    let metas;
    try {
      metas = await sessionIndex.listSessions();
    } catch (err) {
      console.error('[SessionManager] reconciler index indisponible:', err.message);
      return;
    }

    const configuredMain = String(process.env.PHONE_NUMBER || '').replace(/\\D/g, '');

    for (const meta of metas) {
      const sessionId = meta.sessionId || meta._id;
      const phoneNumber = String(meta.phoneNumber || sessionId || '').replace(/^session_/, '').replace(/\\D/g, '');
      if (!sessionId || !phoneNumber || phoneNumber.length < 7) continue;
      if (meta.state?.requiresPairing === true || meta.state?.isRegistered !== true) continue;
      if (configuredMain && phoneNumber === configuredMain) continue;
      if (activeSessions.has(sessionId) || _registeredSessionReconcileInFlight.has(sessionId)) continue;

      const hasAuth = await _hasRecoverableSessionAuth(db, sessionId);
      if (!hasAuth) continue;

      _registeredSessionReconcileInFlight.add(sessionId);
      console.log(\`[SessionManager] ♻️ Reconciler relance \${sessionId} absent de la mémoire active\`);
      startSession(db, phoneNumber, {
        owner: meta.owner,
        origin: meta.origin,
        reconnectAttempts: Number(meta.stats?.reconnectCount) || 0,
      })
        .catch(err => console.error(\`[SessionManager] reconciler \${sessionId}:\`, err.message))
        .finally(() => _registeredSessionReconcileInFlight.delete(sessionId));
    }
  };

  const firstRun = setTimeout(() => reconcile().catch(() => {}), 2_000);
  if (firstRun.unref) firstRun.unref();

  _registeredSessionReconcilerTimer = setInterval(() => {
    reconcile().catch(() => {});
  }, intervalMs);
  if (_registeredSessionReconcilerTimer.unref) _registeredSessionReconcilerTimer.unref();

  console.log(\`[SessionManager] ♾️ Reconciler sessions enregistrées actif toutes les \${Math.round(intervalMs / 1000)}s\`);
  return _registeredSessionReconcilerTimer;
}
`;

session = replaceOnce(
  session,
  "\nmodule.exports = {\n  startSession,",
  reconciler + "\nmodule.exports = {\n  startSession,",
  '[REGISTERED SESSION RECONCILER]',
  'reconciler sessions enregistrées'
);

session = replaceOnce(
  session,
  "  startOrphanSessionSweep,\n};",
  "  startOrphanSessionSweep,\n  startRegisteredSessionReconciler,\n};",
  '  startRegisteredSessionReconciler,',
  'export reconciler'
);

fs.writeFileSync(sessionPath, session, 'utf8');

// ───────────────────────────────────────────────────────────────────────────
// 3) Session principale : même politique + watchdog + Mongo obligatoire si configuré.
// ───────────────────────────────────────────────────────────────────────────
let index = fs.readFileSync(indexPath, 'utf8');

const monoHelpers = `// [MONO SESSION UPTIME GUARD]
let monoHeartbeatFailures = 0;
let monoRecoveryInFlight = false;

function _monoWsState(sock) {
  return sock?.ws?.readyState ?? sock?.ws?.socket?.readyState ?? null;
}

function _monoMessageText(msg) {
  let m = msg?.message || {};
  for (let i = 0; i < 4; i++) {
    if (m?.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
    if (m?.viewOnceMessage?.message) { m = m.viewOnceMessage.message; continue; }
    if (m?.viewOnceMessageV2?.message) { m = m.viewOnceMessageV2.message; continue; }
    if (m?.viewOnceMessageV2Extension?.message) { m = m.viewOnceMessageV2Extension.message; continue; }
    break;
  }
  return String(
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    m?.buttonsResponseMessage?.selectedButtonId ||
    m?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m?.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

async function _sendMonoHandlerFailureFallback(sock, jid, msg) {
  const prefix = String(config.prefix || '.');
  if (!_monoMessageText(msg).trim().startsWith(prefix) || !jid) return;
  const payload = {
    text: '⚠️ *Commande reçue, mais son exécution a rencontré une erreur temporaire.*\\n\\nRéessaie dans quelques secondes.'
  };
  try {
    await sock.sendMessage(jid, payload, { quoted: msg });
  } catch (_) {
    try { await sock.sendMessage(jid, payload); } catch (_) {}
  }
}

function scheduleMonoRecovery(reason, delayMs = 1_000) {
  if (reconnectTimer) return;
  const delay = Math.min(Math.max(Number(delayMs) || 1_000, 750), MAX_RECONNECT_DELAY);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      const nextSock = await startBot();
      if (!nextSock) throw new Error('socket non créé');
      monoRecoveryInFlight = false;
    } catch (err) {
      originalConsoleError(\`[Mono-Session] recovery impossible (\${reason}):\`, err.message);
      monoRecoveryInFlight = false;
      scheduleMonoRecovery('retry', Math.min(Math.ceil(delay * 1.4), MAX_RECONNECT_DELAY));
    }
  }, delay);
  if (reconnectTimer.unref) reconnectTimer.unref();
}
`;

index = replaceOnce(
  index,
  "let activeSock     = null;",
  "let activeSock     = null;\n\n" + monoHelpers,
  '[MONO SESSION UPTIME GUARD]',
  'helpers uptime mono-session'
);

const terminalArray = `      const terminalDisconnect = [
        DisconnectReason.loggedOut,
        DisconnectReason.connectionReplaced,
        DisconnectReason.badSession,
      ].includes(statusCode);
      const shouldReconnect = !terminalDisconnect;`;

index = replaceOnce(
  index,
  terminalArray,
  "      // [MONO IMMORTAL RECONNECT] Seul loggedOut est terminal.\n      const terminalDisconnect = statusCode === DisconnectReason.loggedOut;\n      const shouldReconnect = !terminalDisconnect;",
  '[MONO IMMORTAL RECONNECT]',
  'reconnexion mono hors loggedOut'
);

const oldMonoReconnect = `        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (activeSock !== sock) return;
          try { sock.ev?.removeAllListeners?.(); } catch (_) {}
          activeSock = null;
          startBot().catch(err => originalConsoleError('[Mono-Session] reconnexion impossible:', err.message));
        }, delay);
        if (reconnectTimer.unref) reconnectTimer.unref();`;

const newMonoReconnect = `        if (activeSock === sock) {
          try { sock.ev?.removeAllListeners?.(); } catch (_) {}
          activeSock = null;
        }
        monoRecoveryInFlight = true;
        scheduleMonoRecovery(\`close code=\${statusCode ?? '?'}\`, delay); // [MONO RECONNECT LOOP]`;

index = replaceOnce(
  index,
  oldMonoReconnect,
  newMonoReconnect,
  '[MONO RECONNECT LOOP]',
  'reconnexion mono récursive'
);

index = replaceOnce(
  index,
  "      botReadyTime      = Date.now();\n      reconnectAttempts = 0;",
  "      botReadyTime      = Date.now();\n      reconnectAttempts = 0;\n      monoHeartbeatFailures = 0; // [MONO OPEN RESET]\n      monoRecoveryInFlight = false;",
  '[MONO OPEN RESET]',
  'reset watchdog mono à ouverture'
);

const oldMonoHeartbeat = `      heartbeatTimer = setInterval(async () => {
        try { await sock.sendPresenceUpdate('available'); } catch (_) {}
      }, 30 * 1000); // toutes les 30 secondes — maintient la session active`;

const newMonoHeartbeat = `      heartbeatTimer = setInterval(async () => {
        try {
          await sock.sendPresenceUpdate('available');
          monoHeartbeatFailures = 0;
        } catch (_) {
          monoHeartbeatFailures += 1;
        }
      }, 30 * 1000); // [MONO HEARTBEAT ACTIVE]
      if (heartbeatTimer.unref) heartbeatTimer.unref();

      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(async () => {
        if (activeSock !== sock || monoRecoveryInFlight) return;
        const wsState = _monoWsState(sock);
        const wsUnhealthy = wsState != null && wsState !== 1;
        const heartbeatUnhealthy = monoHeartbeatFailures >= 3;
        if (!wsUnhealthy && !heartbeatUnhealthy) return;

        monoRecoveryInFlight = true; // [MONO SOCKET WATCHDOG]
        const reason = wsUnhealthy
          ? \`WebSocket state=\${wsState}\`
          : \`heartbeat failures=\${monoHeartbeatFailures}\`;
        originalConsoleWarn(\`♻️ [Mono-Session] socket muet détecté (\${reason}) — recyclage\`);

        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (activeSock === sock) activeSock = null;
        try { sock.ev?.removeAllListeners?.(); } catch (_) {}
        try { sock.end?.(new Error('uptime watchdog recycle')); } catch (_) {}
        scheduleMonoRecovery('watchdog', 750);
      }, 45_000);
      if (pingTimer.unref) pingTimer.unref();`;

index = replaceOnce(
  index,
  oldMonoHeartbeat,
  newMonoHeartbeat,
  '[MONO SOCKET WATCHDOG]',
  'watchdog socket mono-session'
);

const oldMonoCatch = `      } catch (err) {
        if (!err.message?.includes('rate-overlimit')) {
          console.error('⚠️ Erreur message :', err.message);
        }
      }`;

const newMonoCatch = `      } catch (err) {
        // [MONO HANDLER FAILURE FALLBACK]
        await _sendMonoHandlerFailureFallback(sock, from, msg);
        if (!err.message?.includes('rate-overlimit')) {
          console.error('⚠️ Erreur message :', err.message);
        }
      }`;

index = replaceOnce(
  index,
  oldMonoCatch,
  newMonoCatch,
  '[MONO HANDLER FAILURE FALLBACK]',
  'fallback erreur handler mono-session'
);

index = replaceOnce(
  index,
  "    await sm.loadAllSessions(_mongoDb);\n    originalConsoleLog('✅ [Multi-Session] MongoDB connecté — sessions rechargées');",
  "    await sm.loadAllSessions(_mongoDb);\n    sm.startRegisteredSessionReconciler(_mongoDb); // [MULTI SESSION RECONCILER START]\n    originalConsoleLog('✅ [Multi-Session] MongoDB connecté — sessions rechargées + reconciler actif');",
  '[MULTI SESSION RECONCILER START]',
  'démarrage reconciler'
);

index = replaceOnce(
  index,
  "    const multiSessionActive = await initMultiSession().catch(() => false);\n\n    // ── Mono-session classique (toujours actif pour l'owner principal) ────",
  "    const multiSessionActive = await initMultiSession().catch(() => false);\n    if (process.env.MONGODB_URI && !multiSessionActive) { // [MONGO REQUIRED RETRY]\n      throw new Error('MongoDB indisponible : nouvelle tentative de démarrage requise pour restaurer les sessions persistantes');\n    }\n\n    // ── Mono-session classique (toujours actif pour l'owner principal) ────",
  '[MONGO REQUIRED RETRY]',
  'ne pas tomber sur auth locale vide si Mongo est configuré'
);

fs.writeFileSync(indexPath, index, 'utf8');

// ───────────────────────────────────────────────────────────────────────────
// 4) Vérifications locales de build.
// ───────────────────────────────────────────────────────────────────────────
for (const file of [sessionIndexPath, sessionPath, indexPath]) nodeCheck(file);

const finalSession = fs.readFileSync(sessionPath, 'utf8');
const finalIndex = fs.readFileSync(indexPath, 'utf8');
const finalSessionIndex = fs.readFileSync(sessionIndexPath, 'utf8');

for (const required of [
  '[SESSION UPTIME GUARD]',
  '[SESSION SOCKET WATCHDOG]',
  '[MULTI SESSION APPEND FROMME]',
  '[SESSION HANDLER FAILURE FALLBACK]',
  '[REGISTERED SESSION RECONCILER]',
  '[SESSION LOGGEDOUT STATE]',
  'startRegisteredSessionReconciler,',
]) {
  if (!finalSession.includes(required)) throw new Error(`[session-uptime] sessionManager garde-fou absent: ${required}`);
}

for (const required of [
  '[MONO SESSION UPTIME GUARD]',
  '[MONO IMMORTAL RECONNECT]',
  '[MONO SOCKET WATCHDOG]',
  '[MONO HANDLER FAILURE FALLBACK]',
  '[MULTI SESSION RECONCILER START]',
  '[MONGO REQUIRED RETRY]',
]) {
  if (!finalIndex.includes(required)) throw new Error(`[session-uptime] index garde-fou absent: ${required}`);
}

for (const required of ['[SESSION REPAIR STATE]', '[SESSION REPAIR STATE UPDATE]']) {
  if (!finalSessionIndex.includes(required)) throw new Error(`[session-uptime] sessionIndex garde-fou absent: ${required}`);
}

console.log('[session-uptime] ✅ sessions reconnectables surveillées + append/fromMe + reconciler + fallback commandes');
