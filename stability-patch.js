'use strict';
const fs = require('fs');
const path = require('path');
const BOT = path.join(__dirname, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[stability] bot/ absent — sous-module non cloné.');

function patch(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[stability] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[stability] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(file, src.replace(search, replacement));
  console.log(`[stability] ${label} appliqué`);
}

patch(
  'utils/memoryGuard.js',
  `async function triggerGracefulRestart(memMB, cfg) {\n  // Anti-spam : pas 2 restarts en moins de 3 minutes`,
  `async function triggerGracefulRestart(memMB, cfg) {\n  if (process.env.RENDER === 'true') {\n    _warn(\`[MemoryGuard] Render détecté — restart volontaire annulé à \${memMB} Mo; cleanup conservé, Render gère la limite mémoire.\`);\n    _isRestartPending = false;\n    return;\n  }\n\n  // Anti-spam : pas 2 restarts en moins de 3 minutes`,
  'Render détecté — restart volontaire annulé',
  'MemoryGuard Render'
);

// ── Pairing WhatsApp : version Web réellement servie ─────────────────────
patch(
  'utils/sessionManager.js',
  [
    '  Browsers,',
    '  fetchLatestBaileysVersion,',
    '  proto,',
  ].join('\n'),
  [
    '  Browsers,',
    '  fetchLatestBaileysVersion,',
    '  fetchLatestWaWebVersion,',
    '  proto,',
  ].join('\n'),
  '  fetchLatestWaWebVersion,',
  'import fetchLatestWaWebVersion'
);

patch(
  'utils/sessionManager.js',
  [
    'let _baileysVersion = null;',
    'async function getBaileysVersion() {',
    '  if (!_baileysVersion) {',
    '    const { version } = await fetchLatestBaileysVersion();',
    '    _baileysVersion = version;',
    '  }',
    '  return _baileysVersion;',
    '}',
  ].join('\n'),
  [
    'let _baileysVersion = null;',
    'async function getBaileysVersion() {',
    '  if (!_baileysVersion) {',
    '    try {',
    '      const { version, isLatest } = await fetchLatestWaWebVersion();',
    '      if (Array.isArray(version) && version.length === 3) {',
    '        _baileysVersion = version;',
    "        console.log('[SessionManager] 🌐 WA Web version: ' + version.join('.') + ' | latest=' + isLatest);",
    '      }',
    '    } catch (err) {',
    "      console.warn('[SessionManager] ⚠️ fetchLatestWaWebVersion a échoué: ' + err.message);",
    '    }',
    '',
    '    if (!_baileysVersion) {',
    '      const { version } = await fetchLatestBaileysVersion();',
    '      _baileysVersion = version;',
    "      console.log('[SessionManager] ↩️ fallback version Baileys: ' + version.join('.'));",
    '    }',
    '  }',
    '  return _baileysVersion;',
    '}',
  ].join('\n'),
  '[SessionManager] 🌐 WA Web version:',
  'version WhatsApp Web dynamique'
);

// Mémoriser le moment où Baileys a fini la première phase du handshake QR.
patch(
  'utils/sessionManager.js',
  '    createdAt: Date.now(), // [PHASE 4D] pour le nettoyage des sessions orphelines (voir startOrphanSessionSweep)',
  [
    '    createdAt: Date.now(), // [PHASE 4D] pour le nettoyage des sessions orphelines (voir startOrphanSessionSweep)',
    '    pairingReady: false, // handshake initial reçu : requestPairingCode peut être demandé proprement',
  ].join('\n'),
  'pairingReady: false, // handshake initial reçu',
  'état handshake pairing'
);

patch(
  'utils/sessionManager.js',
  "    const { connection, lastDisconnect, isNewLogin } = update;",
  [
    "    const { connection, lastDisconnect, isNewLogin, qr } = update;",
    '    if (qr && !session.isRegistered) session.pairingReady = true;',
  ].join('\n'),
  'if (qr && !session.isRegistered) session.pairingReady = true;',
  'détection handshake QR'
);

// Avant, un délai fixe de 3 s était utilisé. Selon la charge et la version
// WhatsApp Web, le socket peut ne pas encore être prêt. On attend maintenant
// le signal QR/handshake, avec un fallback borné pour ne jamais bloquer.
patch(
  'utils/sessionManager.js',
  [
    '  // Petit délai de grâce pour laisser le socket terminer sa poignée de main',
    "  // initiale avant de demander le code (comportement conservé de l'ancienne",
    '  // implémentation inline).',
    '  const delayMs = opts.delayMs ?? 3000;',
    '  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));',
    '',
    '  const timeoutMs = opts.timeoutMs ?? 20000;',
    '  const raw = await withTimeout(',
    "    sock.requestPairingCode(String(phoneNumber).replace(/\\D/g, '')),",
    '    timeoutMs,',
    "    'requestPairingCode'",
    '  );',
  ].join('\n'),
  [
    '  const cleanNumber = String(phoneNumber).replace(/\\D/g, \'\');',
    '  const explicitDelayMs = opts.delayMs;',
    '',
    '  if (Number.isFinite(explicitDelayMs) && explicitDelayMs > 0) {',
    '    await new Promise(r => setTimeout(r, explicitDelayMs));',
    '  } else if (!session.pairingReady) {',
    '    const handshakeTimeoutMs = opts.handshakeTimeoutMs ?? 8000;',
    '    const started = Date.now();',
    '    while (!session.pairingReady && (Date.now() - started) < handshakeTimeoutMs) {',
    '      await new Promise(r => setTimeout(r, 100));',
    '    }',
    '    if (!session.pairingReady) {',
    "      console.warn('[SessionManager] ⚠️ handshake QR non observé dans le délai — tentative pairing directe');",
    '    }',
    '  }',
    '',
    '  const timeoutMs = opts.timeoutMs ?? 30000;',
    '  const raw = await withTimeout(',
    '    sock.requestPairingCode(cleanNumber),',
    '    timeoutMs,',
    "    'requestPairingCode'",
    '  );',
  ].join('\n'),
  'handshake QR non observé dans le délai',
  'attente handshake avant pairing code'
);

console.log('[stability] Patch Render + pairing terminé.');
