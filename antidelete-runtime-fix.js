'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const handlerPath = path.join(BOT, 'handler.js');
const databasePath = path.join(BOT, 'database.js');

for (const file of [handlerPath, databasePath]) {
  if (!fs.existsSync(file)) throw new Error(`[antidelete-fix] fichier absent: ${file}`);
}

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[antidelete-fix] ${label}: ancre attendue exactement 1 fois, trouvée ${count}`);
  }
  return source.replace(search, replacement);
}

// 1) Réglages privés : updateUser() normalise déjà le JID en numéro.
// getUserSettings() doit utiliser la même clé, tout en gardant la compatibilité
// avec d'éventuelles anciennes entrées stockées sous le JID complet.
let database = fs.readFileSync(databasePath, 'utf8');
const oldUserSettings = `const getUserSettings = (chatId) => {\n  const users = readDB('users');\n  return users[chatId] || {};\n};`;
const newUserSettings = `const getUserSettings = (chatId) => {\n  // [ANTIDELETE PRIVATE KEY NORMALIZATION]\n  const users = readDB('users');\n  const key = String(chatId).split('@')[0].split(':')[0];\n  return users[key] || users[chatId] || {};\n};`;
if (!database.includes('[ANTIDELETE PRIVATE KEY NORMALIZATION]')) {
  database = replaceOnce(database, oldUserSettings, newUserSettings, 'normalisation getUserSettings');
}
fs.writeFileSync(databasePath, database);

// 2) AntiDelete : Baileys 6.7.22 => REVOKE = 0.
// type 5 = HISTORY_SYNC_NOTIFICATION, ce n'est pas une suppression.
let handler = fs.readFileSync(handlerPath, 'utf8');
handler = handler.replace(
  '// [FIX 3] : type 0 = REVOKE standard, type 5 = éphémère supprimé',
  '// [ANTIDELETE REVOKE ONLY] Baileys 6.7.22 : seul type 0 = REVOKE est une suppression'
);
handler = handler.replace(
  "if (protocolMsg && (protocolMsg.type === 0 || protocolMsg.type === 5) && protocolMsg?.key?.id) {",
  "if (protocolMsg && protocolMsg.type === 0 && protocolMsg?.key?.id) {"
);

// 3) Mode privé : une sous-session .pair doit recevoir son propre AntiDelete.
const oldPrivateDestination = `    if (mode === 'private') {\n      const ownerNum = config.ownerNumber?.[0];\n      destination    = ownerNum ? String(ownerNum).replace(/\\D/g, '') + '@s.whatsapp.net' : null;\n      if (!destination) return;\n    } else {`;
const newPrivateDestination = `    if (mode === 'private') {\n      // [ANTIDELETE SESSION OWNER] La sous-session reçoit ses propres messages supprimés.\n      const ownerNum = sock._sessionPhoneNumber || config.ownerNumber?.[0];\n      destination    = ownerNum ? String(ownerNum).replace(/\\D/g, '') + '@s.whatsapp.net' : null;\n      if (!destination) return;\n    } else {`;
if (!handler.includes('[ANTIDELETE SESSION OWNER]')) {
  handler = replaceOnce(handler, oldPrivateDestination, newPrivateDestination, 'destination privée par session');
}
fs.writeFileSync(handlerPath, handler);

// Vérifications structurelles : le build s'arrête immédiatement en cas de régression.
const finalDatabase = fs.readFileSync(databasePath, 'utf8');
const finalHandler = fs.readFileSync(handlerPath, 'utf8');

for (const marker of [
  '[ANTIDELETE PRIVATE KEY NORMALIZATION]',
  'return users[key] || users[chatId] || {};',
]) {
  if (!finalDatabase.includes(marker)) throw new Error(`[antidelete-fix] database incomplet: ${marker}`);
}
for (const marker of [
  '[ANTIDELETE REVOKE ONLY]',
  '[ANTIDELETE SESSION OWNER]',
  'protocolMsg.type === 0 && protocolMsg?.key?.id',
  'sock._sessionPhoneNumber || config.ownerNumber?.[0]',
]) {
  if (!finalHandler.includes(marker)) throw new Error(`[antidelete-fix] handler incomplet: ${marker}`);
}

const deleteBlockStart = finalHandler.indexOf('// ── DÉTECTION SUPPRESSION');
const deleteBlockEnd = finalHandler.indexOf('// ── DÉCODAGE CONTENU', deleteBlockStart);
if (deleteBlockStart < 0 || deleteBlockEnd < 0) {
  throw new Error('[antidelete-fix] bloc de détection suppression introuvable');
}
const deleteBlock = finalHandler.slice(deleteBlockStart, deleteBlockEnd);
if (deleteBlock.includes('protocolMsg.type === 5')) {
  throw new Error('[antidelete-fix] type 5 est encore traité comme suppression');
}

const checks = [handlerPath, databasePath];
for (const file of checks) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`[antidelete-fix] syntaxe invalide ${path.relative(BOT, file)}: ${result.stderr || result.stdout}`);
  }
}

console.log('[antidelete-fix] OK — REVOKE=0 uniquement, settings privés normalisés, owner de session respecté');
