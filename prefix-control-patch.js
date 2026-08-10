'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const OVERRIDES = path.join(ROOT, 'overrides');

const prefixManagerSrc = path.join(OVERRIDES, 'prefixManager.js');
const setprefixSrc = path.join(OVERRIDES, 'setprefix.js');
const prefixManagerDst = path.join(BOT, 'utils', 'prefixManager.js');
const setprefixDst = path.join(BOT, 'commands', 'bot_sovereignty', 'setprefix.js');
const databasePath = path.join(BOT, 'database.js');
const indexPath = path.join(BOT, 'index.js');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const pairingServicePath = path.join(BOT, 'utils', 'pairingService.js');
const apiServerPath = path.join(BOT, 'api', 'server.js');

for (const file of [
  prefixManagerSrc, setprefixSrc, databasePath, indexPath,
  menuPath, pairingServicePath, apiServerPath,
]) {
  if (!fs.existsSync(file)) throw new Error(`[prefix-control] fichier absent: ${file}`);
}

fs.copyFileSync(prefixManagerSrc, prefixManagerDst);
fs.copyFileSync(setprefixSrc, setprefixDst);
console.log('[prefix-control] prefixManager + commande setprefix installés');

function replaceOnce(file, search, replacement, marker, label) {
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[prefix-control] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[prefix-control] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  fs.writeFileSync(file, src);
  console.log(`[prefix-control] ${label} appliqué`);
}

// ── 1) botState local : même stockage que ghostgMode/compteurs ────────────
replaceOnce(
  databasePath,
  `const setGhostgMode = (value) => {\n  const state = readDB('botState');\n  state.ghostgMode = value;\n  return writeDB('botState', state);\n};`,
  `const setGhostgMode = (value) => {\n  const state = readDB('botState');\n  state.ghostgMode = value;\n  return writeDB('botState', state);\n};\n\n// ── Préfixe dynamique du bot ─────────────────────────────────────\nconst getBotPrefix = () => {\n  const state = readDB('botState');\n  if (!state.prefix) {\n    state.prefix = config.prefix || '.';\n    writeDB('botState', state);\n  }\n  return state.prefix;\n};\n\nconst setBotPrefix = (value) => {\n  const state = readDB('botState');\n  state.prefix = value;\n  return writeDB('botState', state);\n};`,
  'const getBotPrefix = () =>',
  'stockage local du préfixe'
);

replaceOnce(
  databasePath,
  `  getGhostgMode,\n  setGhostgMode,`,
  `  getGhostgMode,\n  setGhostgMode,\n  getBotPrefix,\n  setBotPrefix,`,
  '  getBotPrefix,',
  'exports préfixe database'
);

// ── 2) Charger le préfixe AVANT handler/commandLoader ─────────────────────
replaceOnce(
  indexPath,
  `const handler = require('./handler');`,
  `let handler = null; // chargé après restauration du préfixe persistant`,
  'let handler = null; // chargé après restauration du préfixe persistant',
  'handler lazy'
);

replaceOnce(
  indexPath,
  `  try {\n    // ── Multi-session MongoDB (si MONGODB_URI configuré) ─────────────────\n    const multiSessionActive = await initMultiSession().catch(() => false);`,
  `  try {\n    // Restaurer le préfixe (Mongo > botState local > .env) AVANT de charger\n    // handler.js et les commandes qui peuvent mémoriser config.prefix.\n    await require('./utils/prefixManager').initializePrefix();\n    if (!handler) handler = require('./handler');\n\n    // ── Multi-session MongoDB (si MONGODB_URI configuré) ─────────────────\n    const multiSessionActive = await initMultiSession().catch(() => false);`,
  "await require('./utils/prefixManager').initializePrefix();",
  'restauration préfixe avant handler'
);

// ── 3) Empêcher le pairing HTTP de charger sessionManager/handler trop tôt ─
replaceOnce(
  pairingServicePath,
  `const sessionManager = require('./sessionManager');`,
  `const sessionManager = new Proxy({}, {\n  get(_target, prop) { return require('./sessionManager')[prop]; }\n});`,
  "return require('./sessionManager')[prop]",
  'sessionManager lazy dans pairingService'
);

replaceOnce(
  apiServerPath,
  `const sessionManager = require('../utils/sessionManager');`,
  `const sessionManager = new Proxy({}, {\n  get(_target, prop) { return require('../utils/sessionManager')[prop]; }\n});`,
  "return require('../utils/sessionManager')[prop]",
  'sessionManager lazy dans API'
);

// ── 4) Menu : variable locale synchronisable immédiatement ────────────────
replaceOnce(
  menuPath,
  `const prefix = config.prefix || '.';`,
  `let prefix = config.prefix || '.';`,
  `let prefix = config.prefix || '.';`,
  'préfixe menu mutable'
);

let menu = fs.readFileSync(menuPath, 'utf8');
if (!menu.includes('module.exports.setRuntimePrefix =')) {
  menu += `\n\n// Synchronisation immédiate après .setprefix sans recharger le processus.\nmodule.exports.setRuntimePrefix = (value) => {\n  prefix = String(value || '.');\n};\n`;
  fs.writeFileSync(menuPath, menu);
  console.log('[prefix-control] setter runtime du menu ajouté');
}

// ── 5) Vérifications structurelles et syntaxiques ────────────────────────
const setprefix = fs.readFileSync(setprefixDst, 'utf8');
if (!setprefix.includes("name: 'setprefix'") || !setprefix.includes('ownerOnly: true')) {
  throw new Error('[prefix-control] setprefix doit rester ownerOnly');
}

const prefixManager = fs.readFileSync(prefixManagerDst, 'utf8');
if (!prefixManager.includes('/[\\p{L}\\p{N}]/u') || !prefixManager.includes('mongoPersisted')) {
  throw new Error('[prefix-control] validation/persistance du prefixManager inattendue');
}

for (const file of [
  prefixManagerDst, setprefixDst, databasePath, indexPath,
  menuPath, pairingServicePath, apiServerPath,
]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[prefix-control] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

console.log('[prefix-control] ✅ préfixe symboles/emojis dynamique + Mongo + restauration startup prêts');
