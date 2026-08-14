'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[runtime-core] bot/ absent — sous-module non cloné.');

function patch(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[runtime-core] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[runtime-core] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(file, src.replace(search, replacement));
  console.log(`[runtime-core] ${label} appliqué`);
}

function check(rel) {
  const file = path.join(BOT, rel);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`[runtime-core] syntaxe invalide ${rel}: ${result.stderr || result.stdout}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU / ALLMENU — jamais bloqué par une longue chaîne d'URLs d'images
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

const newMenuFetch = `// [FIX MENU 2026-08] Chargement borné : l'image ne peut plus bloquer le menu.
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
  if (_menuImageCache.size > 30) _menuImageCache.delete(_menuImageCache.keys().next().value);
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
  if (!urls.length) return null;

  const candidates = [...urls].sort(() => Math.random() - 0.5).slice(0, 3);
  const results = await Promise.all(candidates.map(url => fetchMenuImage(url, 3000)));
  const image = results.find(Boolean) || null;
  if (image) cacheMenuImage(key, image);
  return image;
}
`;

patch(menuRel, oldMenuFetch, newMenuFetch, '[FIX MENU 2026-08]', 'menu images rapides + cache');

const handlerRel = 'handler.js';
patch(
  handlerRel,
  'const CACHE_TTL          = 300000; // [PERF] 5 min — reduit les requetes reseau vers WhatsApp',
  'const CACHE_TTL          = 60000; // [PERF/STABILITÉ] 60 s — 1 metadata réseau max/min/groupe',
  '1 metadata réseau max/min/groupe',
  'cache metadata groupe'
);
patch(
  handlerRel,
  'const getGroupMetadata = getLiveGroupMetadata;',
  'const getGroupMetadata = getCachedGroupMetadata;',
  'const getGroupMetadata = getCachedGroupMetadata;',
  'metadata via cache borné'
);

const oldGetBotAdmin = `    const getBotAdmin = async () => {
      if (!isGroup) return false;
      if (!_botIsAdminLoaded) { _botIsAdmin = await isBotAdmin(sock, from); _botIsAdminLoaded = true; }
      return _botIsAdmin;
    };`;
const newGetBotAdmin = `    const getBotAdmin = async () => {
      if (!isGroup) return false;
      if (!_botIsAdminLoaded) {
        const meta = await getGroupMeta();
        const rawIds = [sock.user?.id, sock.user?.jid, sock.user?.lid].filter(Boolean);
        const botEntry = findParticipant(meta?.participants || [], rawIds);
        const adm = botEntry?.admin ?? botEntry?.isAdmin ?? botEntry?.isSuperAdmin;
        _botIsAdmin = adm === 'admin' || adm === 'superadmin' || adm === true;
        _botIsAdminLoaded = true;
      }
      return _botIsAdmin;
    };`;
patch(handlerRel, oldGetBotAdmin, newGetBotAdmin, 'Réutiliser la metadata déjà chargée', 'bot admin sans requête doublée');

patch(
  handlerRel,
  `    ];
    const destJid   = msg?.key?.remoteJid;`,
  `    ];
    const errText = errMsgs[Math.floor(Math.random() * errMsgs.length)];
    const destJid   = msg?.key?.remoteJid;`,
  'const errText = errMsgs[Math.floor',
  'erreur commande affichable'
);

for (const rel of ['commands/group_management/tagall.js', 'commands/group_management/hidetag.js']) {
  patch(
    rel,
    '  botAdminNeeded: true,',
    '  botAdminNeeded: false, // Mentionner les membres ne nécessite pas les droits admin du bot',
    'botAdminNeeded: false, // Mentionner les membres',
    `${path.basename(rel)} sans bot-admin`
  );
}

const sessionRel = 'utils/sessionManager.js';
patch(
  sessionRel,
  '  let reconnectAttempts = 0;',
  '  let reconnectAttempts = Number.isFinite(opts.reconnectAttempts) ? opts.reconnectAttempts : 0;',
  'Number.isFinite(opts.reconnectAttempts)',
  'backoff reconnect conservé'
);
patch(
  sessionRel,
  '      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !_isShuttingDown;',
  `      const terminalDisconnect = [
        DisconnectReason.loggedOut,
        DisconnectReason.connectionReplaced,
        DisconnectReason.badSession,
      ].includes(statusCode);
      const shouldReconnect = !terminalDisconnect && !_isShuttingDown;`,
  'const terminalDisconnect = [',
  'déconnexions terminales'
);
patch(
  sessionRel,
  "          if (!_isShuttingDown) startSession(db, phoneNumber, { owner: opts.owner, origin: opts.origin }).catch(() => {});",
  "          if (!_isShuttingDown) startSession(db, phoneNumber, { owner: opts.owner, origin: opts.origin, reconnectAttempts }).catch(err => console.error(`[SessionManager] ❌ reconnexion ${sessionId}:`, err.message));",
  '            reconnectAttempts,\n          }).catch(err => {',
  'backoff propagé entre sockets'
);
patch(
  sessionRel,
  `  try { clearInterval(session.timers.processedTimer); } catch {}
  session.messageStore?.clear?.();`,
  `  try { clearInterval(session.timers.processedTimer); } catch {}
  try { session.sock?.ev?.removeAllListeners?.(); } catch {}
  session.messageStore?.clear?.();`,
  'Éliminer les anciens listeners avant recréation',
  'listeners socket nettoyés'
);

for (const rel of [
  menuRel,
  handlerRel,
  'commands/group_management/tagall.js',
  'commands/group_management/hidetag.js',
  sessionRel,
]) check(rel);

require('./supreme-owner-reaction-patch');
require('./connected-owner-command-audit-fix');
require('./command-admin-capability-audit');

console.log('[runtime-core] ✅ menu/allmenu, handler, sessions, tagall/hidetag + accès connected-owner + audit bot-admin stabilisés');
