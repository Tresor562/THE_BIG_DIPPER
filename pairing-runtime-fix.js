'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[pairing-runtime] bot/ absent — sous-module non cloné.');

function patch(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[pairing-runtime] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[pairing-runtime] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(file, src.replace(search, replacement));
  console.log(`[pairing-runtime] ${label} appliqué`);
}

function check(rel) {
  const file = path.join(BOT, rel);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`[pairing-runtime] syntaxe invalide ${rel}: ${result.stderr || result.stdout}`);
}

const sessionRel = 'utils/sessionManager.js';

// Le statut mémoire doit suivre immédiatement la validation des credentials.
// Sinon /session/status peut annoncer isRegistered:false après un pairing réussi.
patch(
  sessionRel,
  "  sock.ev.on('creds.update', saveCreds);",
  `  sock.ev.on('creds.update', async (update) => {
    try { await saveCreds(); } catch (err) {
      console.error(\`[SessionManager] ❌ saveCreds ${'${sessionId}'}:\`, err.message);
    }
    if (update?.registered === true || state.creds?.registered === true) {
      session.isRegistered = true;
      sessionIndex.setState(sessionId, { isRegistered: true }).catch(() => {});
    }
  });`,
  'session.isRegistered = true;',
  'statut registered synchronisé'
);

// Mémoriser le handshake initial. requestPairingCode reste avec un fallback
// borné afin de fonctionner même si une version Baileys ne remonte pas `qr`.
patch(
  sessionRel,
  '    createdAt: Date.now(), // [PHASE 4D] pour le nettoyage des sessions orphelines (voir startOrphanSessionSweep)',
  `    createdAt: Date.now(), // [PHASE 4D] pour le nettoyage des sessions orphelines (voir startOrphanSessionSweep)
    pairingReady: false,`,
  '    pairingReady: false,',
  'état handshake pairing'
);

patch(
  sessionRel,
  "    const { connection, lastDisconnect, isNewLogin } = update;",
  `    const { connection, lastDisconnect, isNewLogin, qr } = update;
    if (qr && !session.isRegistered) session.pairingReady = true;`,
  'session.pairingReady = true;',
  'détection handshake pairing'
);

patch(
  sessionRel,
  `  // Petit délai de grâce pour laisser le socket terminer sa poignée de main
  // initiale avant de demander le code (comportement conservé de l'ancienne
  // implémentation inline).
  const delayMs = opts.delayMs ?? 3000;
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  const timeoutMs = opts.timeoutMs ?? 20000;
  const raw = await withTimeout(
    sock.requestPairingCode(String(phoneNumber).replace(/\\D/g, '')),
    timeoutMs,
    'requestPairingCode'
  );`,
  `  const cleanNumber = String(phoneNumber).replace(/\\D/g, '');
  const explicitDelayMs = opts.delayMs;
  if (Number.isFinite(explicitDelayMs) && explicitDelayMs > 0) {
    await new Promise(r => setTimeout(r, explicitDelayMs));
  } else if (!session.pairingReady) {
    const handshakeTimeoutMs = opts.handshakeTimeoutMs ?? 8000;
    const started = Date.now();
    while (!session.pairingReady && (Date.now() - started) < handshakeTimeoutMs) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!session.pairingReady) {
      console.warn('[SessionManager] ⚠️ handshake non observé — tentative pairing directe');
    }
  }

  const timeoutMs = opts.timeoutMs ?? 30000;
  const raw = await withTimeout(
    sock.requestPairingCode(cleanNumber),
    timeoutMs,
    'requestPairingCode'
  );`,
  'handshake non observé — tentative pairing directe',
  'attente handshake avant code'
);

// Le site doit identifier explicitement sa source ; l'API et owner-pairing-patch
// peuvent alors appliquer les mêmes règles que Telegram/WhatsApp sans ambiguïté.
patch(
  'public/js/app.js',
  "      body: JSON.stringify({ phoneNumber: phoneNumber }),",
  "      body: JSON.stringify({ phoneNumber: phoneNumber, origin: 'website' }),",
  "origin: 'website'",
  'origine website explicite'
);

check(sessionRel);
check('public/js/app.js');
console.log('[pairing-runtime] ✅ pairing multi-source + statut + handshake stabilisés');
