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
// Si le dépôt source contient déjà cette correction, le marker rend ce patch
// idempotent et aucune seconde logique n'est ajoutée.
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

// Le pairing par code ne dépend pas d'un QR. requestPairingCode() conserve
// son petit délai de grâce propre et appelle directement Baileys. Cela garde
// exactement le même chemin pour le site, Telegram et la commande WhatsApp.

// Le site identifie explicitement sa source ; l'API peut alors appliquer les
// mêmes règles d'identité que Telegram/WhatsApp sans ambiguïté.
patch(
  'public/js/app.js',
  "      body: JSON.stringify({ phoneNumber: phoneNumber }),",
  "      body: JSON.stringify({ phoneNumber: phoneNumber, origin: 'website' }),",
  "origin: 'website'",
  'origine website explicite'
);

check(sessionRel);
check('public/js/app.js');
console.log('[pairing-runtime] ✅ pairing multi-source simple + statut synchronisé');
