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

// [FIX COMMANDES SOUS-SESSIONS]
// Plusieurs patches du wrapper peuvent légitimement installer cette capacité
// avant pairing-runtime-fix.js (notamment kickall-policy-patch.js). L'ancienne
// version exigeait alors encore la ligne notify-only et cassait le build avec
// "attendu 1 occurrence, trouvé 0" alors que le comportement était déjà bon.
//
// Ici on accepte les deux états :
//   1) ancien runtime notify-only -> on le transforme ;
//   2) runtime déjà corrigé notify+append -> on ajoute seulement les marqueurs
//      officiels attendus par session-uptime-guard-patch.js.
function ensureConnectedOwnerAppendPath() {
  const file = path.join(BOT, sessionRel);
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;

  const appendMarker = '[MULTI SESSION APPEND FROMME]';
  if (!src.includes(appendMarker)) {
    const oldListener = "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify') return;";
    const fixedListener = "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify' && type !== 'append') return; // [MULTI SESSION APPEND FROMME]";
    const semanticLine = "    if (type !== 'notify' && type !== 'append') return;";

    const oldCount = src.split(oldListener).length - 1;
    const semanticCount = src.split(semanticLine).length - 1;

    if (oldCount === 1) {
      src = src.replace(oldListener, fixedListener);
      changed = true;
      console.log('[pairing-runtime] messages append du compte connecté acceptés');
    } else if (oldCount === 0 && semanticCount === 1) {
      src = src.replace(semanticLine, `${semanticLine} // ${appendMarker}`);
      changed = true;
      console.log('[pairing-runtime] messages append déjà acceptés — marqueur officiel ajouté');
    } else if (oldCount === 0 && src.includes("type !== 'notify' && type !== 'append'")) {
      throw new Error('[pairing-runtime] chemin notify+append présent mais ambigu — refus de modifier plusieurs listeners');
    } else {
      throw new Error(`[pairing-runtime] messages append du compte connecté acceptés: attendu ancien listener ou état déjà corrigé, trouvé old=${oldCount} semantic=${semanticCount}`);
    }
  } else {
    console.log('[pairing-runtime] messages append du compte connecté acceptés déjà appliqué');
  }

  const filterMarker = '[MULTI SESSION APPEND FILTER]';
  if (!src.includes(filterMarker)) {
    const filterVariants = [
      "      if (type === 'append' && !msg.key.fromMe) continue;",
      "      if (type === 'append' && !msg.key?.fromMe) continue;",
    ];
    const matches = filterVariants
      .map(line => ({ line, count: src.split(line).length - 1 }))
      .filter(x => x.count > 0);
    const total = matches.reduce((sum, x) => sum + x.count, 0);

    if (total === 1) {
      const line = matches[0].line;
      src = src.replace(line, `${line} // ${filterMarker}`);
      changed = true;
      console.log('[pairing-runtime] filtre anti-doublon append déjà présent — marqueur officiel ajouté');
    } else if (total === 0) {
      const loopAnchor = "    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;";
      const count = src.split(loopAnchor).length - 1;
      if (count !== 1) {
        throw new Error(`[pairing-runtime] filtre anti-doublon append: ancre boucle attendue 1 fois, trouvée ${count}`);
      }
      src = src.replace(
        loopAnchor,
        `${loopAnchor}\n\n      // ${filterMarker}\n      // Les append non-fromMe sont des replays/synchronisations d'historique.\n      if (type === 'append' && !msg.key?.fromMe) continue;`
      );
      changed = true;
      console.log('[pairing-runtime] filtre anti-doublon append appliqué');
    } else {
      throw new Error(`[pairing-runtime] filtre anti-doublon append ambigu: ${total} occurrences`);
    }
  } else {
    console.log('[pairing-runtime] filtre anti-doublon append déjà appliqué');
  }

  if (changed) fs.writeFileSync(file, src);

  const final = fs.readFileSync(file, 'utf8');
  if (!final.includes("type !== 'notify' && type !== 'append'")) {
    throw new Error('[pairing-runtime] invariant notify+append absent après correction');
  }
  if (!final.includes("type === 'append' && !msg.key") || !final.includes(filterMarker)) {
    throw new Error('[pairing-runtime] invariant filtre append non-fromMe absent après correction');
  }
}

ensureConnectedOwnerAppendPath();

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
console.log('[pairing-runtime] ✅ pairing multi-source + commandes sous-sessions réparés');
