'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');

if (!fs.existsSync(BOT)) {
  throw new Error('[runtime-core] bot/ absent — sous-module non cloné.');
}

function replaceOnce(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[runtime-core] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[runtime-core] ${label}: attendu 1 occurrence, trouvé ${count}`);
  }
  src = src.replace(search, replacement);
  fs.writeFileSync(file, src);
  console.log(`[runtime-core] ${label} appliqué`);
}

function replaceAll(rel, search, replacement, minCount, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  const count = src.split(search).length - 1;
  if (count < minCount) {
    if (src.includes(replacement)) {
      console.log(`[runtime-core] ${label} déjà appliqué`);
      return;
    }
    throw new Error(`[runtime-core] ${label}: attendu >= ${minCount} occurrence(s), trouvé ${count}`);
  }
  src = src.split(search).join(replacement);
  fs.writeFileSync(file, src);
  console.log(`[runtime-core] ${label} appliqué (${count})`);
}

function check(rel) {
  const file = path.join(BOT, rel);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`[runtime-core] syntaxe invalide ${rel}: ${result.stderr || result.stdout}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) MENU / ALLMENU — réponse bornée, cache image, fallback texte rapide
// ═══════════════════════════════════════════════════════════════════════════
const menuRel = 'commands/general_tools/menu.js';

const oldMenuFetch = `// Récupère une image personnalisée depuis une URL unique (menu personnalisé).
async function getImageBufferFromUrl(url) {
  if (typeof url !== 'string' || !/^https?:\\/\\//i.test(url)) return null;
  const axios = require('axios');
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return responseToImageBuffer(res);
  } catch (_) {
    // Image personnalisée invalide/inaccessible → repli sur l'image du style
    return null;
  }
}

async function getImageBufferForStyle(styleNum) {
  const axios = require('axios');
  // Filtrer les entrées vides, non textuelles ou non HTTP(S).
  const urls = (STYLE_IMAGE_URLS[styleNum] || STYLE_IMAGE_URLS[1])
    .filter(u => typeof u === 'string' && /^https?:\\/\\//i.test(u));
  if (urls.length === 0) return null;
  // Choisir une URL au hasard
  const shuffled = [...urls].sort(() => Math.random() - 0.5);
  for (const url of shuffled) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const image = responseToImageBuffer(res);
      if (image) return image;
    } catch (_) {
      // Essaie l'URL suivante si celle-ci échoue
    }
  }
  return null; // Toutes les URLs ont échoué → menu en texte
}
`;

const newMenuFetch = `// [FIX MENU 2026-08] Les anciens téléchargements étaient séquentiels :
// jusqu'à 10 s PAR URL. Avec 10+ URLs (et certains liens ibb.co non directs),
// .menu pouvait rester bloqué plus d'une minute après la réaction du bot.
// On borne maintenant le travail à 3 URLs en parallèle, ~3 s max, avec cache.
const _menuImageCache = new Map();
const MENU_IMAGE_TTL_MS = 15 * 60 * 1000;
const MENU_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function getCachedMenuImage(key) {
  const entry = _menuImageCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > MENU_IMAGE_TTL_MS) {
    _menuImageCache.delete(key);
    return null;
  }
  return entry.buffer;
}

function cacheMenuImage(key, buffer) {
  if (!buffer) return;
  _menuImageCache.set(key, { buffer, ts: Date.now() });
  if (_menuImageCache.size > 30) {
    const oldest = _menuImageCache.keys().next().value;
    _menuImageCache.delete(oldest);
  }
}

async function fetchMenuImage(url, timeoutMs = 3000) {
  if (typeof url !== 'string' || !/^https?:\\/\\//i.test(url)) return null;
  const axios = require('axios');
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: timeoutMs,
      maxRedirects: 4,
      maxContentLength: MENU_IMAGE_MAX_BYTES,
      maxBodyLength: MENU_IMAGE_MAX_BYTES,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: status => status >= 200 && status < 300,
    });
    return responseToImageBuffer(res);
  } catch (_) {
    return null;
  }
}

// Récupère une image personnalisée depuis une URL unique (menu personnalisé).
async function getImageBufferFromUrl(url) {
  const key = 'custom:' + String(url || '');
  const cached = getCachedMenuImage(key);
  if (cached) return cached;
  const image = await fetchMenuImage(url, 3000);
  if (image) cacheMenuImage(key, image);
  return image;
}

async function getImageBufferForStyle(styleNum) {
  const key = 'style:' + String(styleNum);
  const cached = getCachedMenuImage(key);
  if (cached) return cached;

  const urls = (STYLE_IMAGE_URLS[styleNum] || STYLE_IMAGE_URLS[1])
    .filter(u => typeof u === 'string' && /^https?:\\/\\//i.test(u));
  if (urls.length === 0) return null;

  // Trois essais max, en parallèle : le menu texte reste toujours prioritaire.
  const candidates = [...urls].sort(() => Math.random() - 0.5).slice(0, 3);
  const results = await Promise.all(candidates.map(url => fetchMenuImage(url, 3000)));
  const image = results.find(Boolean) || null;
  if (image) cacheMenuImage(key, image);
  return image;
}
`;

replaceOnce(
  menuRel,
  oldMenuFetch,
  newMenuFetch,
  '[FIX MENU 2026-08]',
  'menu images rapides + cache'
);

// Garder allmenu bien sous la taille pratique d'un message WhatsApp et le
// fractionner proprement si le nombre de commandes augmente.
replaceOnce(
  menuRel,
  'function buildAllMenuChunks(categoryNames, categories, prefix, count, maxChars = 52000) {',
  'function buildAllMenuChunks(categoryNames, categories, prefix, count, maxChars = 12000) {',
  'maxChars = 12000',
  'allmenu chunks sûrs'
);

// ═══════════════════════════════════════════════════════════════════════════
// 2) HANDLER — erreurs visibles + réduction drastique des appels groupMetadata
// ═══════════════════════════════════════════════════════════════════════════
const handlerRel = 'handler.js';

replaceOnce(
  handlerRel,
  'const CACHE_TTL          = 300000; // [PERF] 5 min — reduit les requetes reseau vers WhatsApp',
  'const CACHE_TTL          = 60000; // [PERF/STABILITÉ] 60 s — 1 metadata réseau max/min/groupe',
  '1 metadata réseau max/min/groupe',
  'TTL metadata groupe'
);

replaceOnce(
  handlerRel,
  'const getGroupMetadata = getLiveGroupMetadata;',
  'const getGroupMetadata = getCachedGroupMetadata;',
  'const getGroupMetadata = getCachedGroupMetadata;',
  'metadata groupe via cache borné'
);

const oldGetBotAdminClosure = `    const getBotAdmin = async () => {
      if (!isGroup) return false;
      if (!_botIsAdminLoaded) { _botIsAdmin = await isBotAdmin(sock, from); _botIsAdminLoaded = true; }
      return _botIsAdmin;
    };`;

const newGetBotAdminClosure = `    const getBotAdmin = async () => {
      if (!isGroup) return false;
      if (!_botIsAdminLoaded) {
        // Réutiliser la metadata déjà chargée au lieu de refaire un second
        // sock.groupMetadata() pour chaque message/commande du groupe.
        const meta = await getGroupMeta();
        const rawIds = [sock.user?.id, sock.user?.jid, sock.user?.lid].filter(Boolean);
        const botEntry = findParticipant(meta?.participants || [], rawIds);
        const adm = botEntry?.admin ?? botEntry?.isAdmin ?? botEntry?.isSuperAdmin;
        _botIsAdmin = adm === 'admin' || adm === 'superadmin' || adm === true;
        _botIsAdminLoaded = true;
      }
      return _botIsAdmin;
    };`;

replaceOnce(
  handlerRel,
  oldGetBotAdminClosure,
  newGetBotAdminClosure,
  'Réutiliser la metadata déjà chargée',
  'bot admin sans second appel metadata'
);

// Le catch construisait errMsgs mais utilisait ensuite errText sans le définir.
// Cela masquait précisément les erreurs d'envoi/commande : réaction visible,
// aucune réponse explicative.
replaceOnce(
  handlerRel,
  `    ];
    const destJid   = msg?.key?.remoteJid;`,
  `    ];
    const errText = errMsgs[Math.floor(Math.random() * errMsgs.length)];
    const destJid   = msg?.key?.remoteJid;`,
  'const errText = errMsgs[Math.floor',
  'message erreur handler défini'
);

// ═══════════════════════════════════════════════════════════════════════════
// 3) TAGALL / HIDETAG — le bot n'a pas besoin d'être admin pour mentionner
// ═══════════════════════════════════════════════════════════════════════════
for (const rel of ['commands/group_management/tagall.js', 'commands/group_management/hidetag.js']) {
  replaceOnce(
    rel,
    '  botAdminNeeded: true,',
    '  botAdminNeeded: false, // Mentionner les membres ne nécessite pas les droits admin du bot',
    'botAdminNeeded: false, // Mentionner les membres',
    `${path.basename(rel)} sans bot-admin`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) SESSIONS — credentials persistants Mongo + reconnexion saine
// ═══════════════════════════════════════════════════════════════════════════
const sessionRel = 'utils/sessionManager.js';

replaceOnce(
  sessionRel,
  "const { useFileAuthState, sessionDirExists } = require('./fileAuthState');",
  "const { useMongoAuthState } = require('./mongoAuth');",
  "const { useMongoAuthState } = require('./mongoAuth');",
  'auth sessions persistante MongoDB'
);

replaceOnce(
  sessionRel,
  '  const { state, saveCreds } = await useFileAuthState(sessionId);',
  '  const { state, saveCreds } = await useMongoAuthState(db, sessionId);',
  'await useMongoAuthState(db, sessionId)',
  'chargement credentials depuis MongoDB'
);

replaceOnce(
  sessionRel,
  `      if (!sessionDirExists(meta.sessionId)) {
        console.error(\`[SessionManager] ⚠️  Session \${meta.sessionId} indexée dans MongoDB mais aucun dossier local de credentials trouvé — reconnexion impossible sans migration (voir scripts/migrate-sessions-to-hybrid.js).\`);
        continue;
      }

`,
  '',
  null,
  'suppression dépendance disque local au redémarrage'
);

replaceOnce(
  sessionRel,
  '  let reconnectAttempts = 0;',
  '  let reconnectAttempts = Number.isFinite(opts.reconnectAttempts) ? opts.reconnectAttempts : 0;',
  'Number.isFinite(opts.reconnectAttempts)',
  'backoff reconnect persistant'
);

replaceOnce(
  sessionRel,
  '      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !_isShuttingDown;',
  `      const terminalDisconnect = [
        DisconnectReason.loggedOut,
        DisconnectReason.connectionReplaced,
        DisconnectReason.badSession,
      ].includes(statusCode);
      const shouldReconnect = !terminalDisconnect && !_isShuttingDown;`,
  'const terminalDisconnect = [',
  'politique reconnexion terminale'
);

replaceOnce(
  sessionRel,
  "          if (!_isShuttingDown) startSession(db, phoneNumber, { owner: opts.owner, origin: opts.origin }).catch(() => {});",
  "          if (!_isShuttingDown) startSession(db, phoneNumber, { owner: opts.owner, origin: opts.origin, reconnectAttempts }).catch(err => console.error(`[SessionManager] ❌ reconnexion ${sessionId}:`, err.message));",
  'origin: opts.origin, reconnectAttempts',
  'propagation compteur reconnexion'
);

replaceOnce(
  sessionRel,
  `  try { clearInterval(session.timers.processedTimer); } catch {}
  session.messageStore?.clear?.();`,
  `  try { clearInterval(session.timers.processedTimer); } catch {}
  // Fermer totalement un ancien socket avant d'en créer un nouveau. Sans ce
  // nettoyage, deux sockets du même compte peuvent se remplacer mutuellement
  // (DisconnectReason.connectionReplaced / 440) et créer une boucle.
  try { session.sock?.ev?.removeAllListeners?.(); } catch {}
  try { session.sock?.end?.(new Error('session cleanup')); } catch {}
  session.messageStore?.clear?.();`,
  "session.sock?.end?.(new Error('session cleanup'))",
  'fermeture sockets zombies'
);

// Vérifications finales des fichiers touchés.
for (const rel of [
  menuRel,
  handlerRel,
  'commands/group_management/tagall.js',
  'commands/group_management/hidetag.js',
  sessionRel,
]) {
  check(rel);
}

console.log('[runtime-core] ✅ menu/allmenu, sessions, metadata, tagall/hidetag stabilisés');
