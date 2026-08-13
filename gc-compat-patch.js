'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const gcPath = path.join(BOT, 'commands', 'group_management', 'gc.js');
const gc2Path = path.join(BOT, 'commands', 'group_management', 'gc2.js');
const gc3Path = path.join(BOT, 'commands', 'group_management', 'gc3.js');
const gc4Path = path.join(BOT, 'commands', 'group_management', 'gc4.js');
const welcomePath = path.join(BOT, 'commands', 'group_management', 'welcome.js');
const goodbyePath = path.join(BOT, 'commands', 'group_management', 'goodbye.js');
const handlerPath = path.join(BOT, 'handler.js');

for (const file of [gcPath, gc2Path, gc3Path, gc4Path, welcomePath, goodbyePath, handlerPath]) {
  if (!fs.existsSync(file)) throw new Error(`[gc-compat] fichier absent: ${file}`);
}

let gc = fs.readFileSync(gcPath, 'utf8');
const oldAdminCheck = "        if (meta.participants.some(p => p.id === senderId && p.admin)) return true;";
const newAdminCheck = `        // Même intention que le test historique, mais compatible LID/PN.\n        // Le handler final est déjà patché pour comparer id/jid/lid/userJid/phoneJid.\n        const { findParticipant } = require('../../handler');\n        const adminEntry = findParticipant(meta.participants, senderId);\n        if (adminEntry && (adminEntry.admin === 'admin' || adminEntry.admin === 'superadmin' || adminEntry.admin === true)) return true;`;

if (gc.includes(oldAdminCheck)) {
  gc = gc.replace(oldAdminCheck, newAdminCheck);
  fs.writeFileSync(gcPath, gc);
  console.log('[gc-compat] .gc: détection admin LID/PN appliquée');
} else if (gc.includes("const adminEntry = findParticipant(meta.participants, senderId);")) {
  console.log('[gc-compat] .gc: détection admin LID/PN déjà appliquée');
} else {
  throw new Error('[gc-compat] bloc admin de gc.js introuvable');
}

for (const file of [welcomePath, goodbyePath, gcPath, gc2Path, gc3Path, gc4Path]) {
  let src = fs.readFileSync(file, 'utf8');
  if (/\bbotAdminNeeded\s*:\s*true\b/.test(src)) {
    src = src.replace(/\bbotAdminNeeded\s*:\s*true\s*,?/g, 'botAdminNeeded: false,');
    fs.writeFileSync(file, src);
    console.log(`[gc-compat] ${path.basename(file)}: faux besoin bot-admin retiré`);
  }
}

require('./group-status-command-fix');

const gc2 = fs.readFileSync(gc2Path, 'utf8');
const gc3 = fs.readFileSync(gc3Path, 'utf8');
const gc4 = fs.readFileSync(gc4Path, 'utf8');

if (!gc2.includes("name: 'gc2'") || !gc2.includes('async execute(sock, msg, args, extra)')) {
  throw new Error('[gc-compat] gc2 n\'est pas exposé au format DIPPER');
}
if (!gc2.includes("aliases: ['upswgc']")) {
  throw new Error('[gc-compat] gc2 doit conserver uniquement l\'alias unique upswgc');
}
if (/aliases\s*:\s*\[[^\]]*['\"]gcstatus['\"]/s.test(gc2)) {
  throw new Error('[gc-compat] collision interdite: gcstatus appartient à groupstatus.js');
}
if (!gc3.includes("name: 'gc3'") || !gc3.includes('async execute(sock, msg, args, extra)')) {
  throw new Error('[gc-compat] gc3 n\'est pas exposé au format DIPPER');
}
if (!gc4.includes("name: 'groupstatus4'") || !gc4.includes("aliases: ['gc4']")) {
  throw new Error('[gc-compat] gc4 a été modifié de manière inattendue');
}

const handler = fs.readFileSync(handlerPath, 'utf8');
for (const marker of [
  "const isMe      = isSuperMe || isOwner(sender) || msg.key.fromMe || _isSessionOwner;",
  'if (!isCommand && isMe && body)',
  'commands.has(_firstWord)',
  'const rawArgs    = (_ownerNoPrefix ? body : body.slice(config.prefix.length))',
  'if (command.ownerOnly && !isMe)',
  'if (command.modOnly && !isMod(sender) && !isMe)',
  'if (command.adminOnly && !isMe && !(await isAdmin(sock, sender, from, groupMetadata)))',
]) {
  if (!handler.includes(marker)) throw new Error(`[gc-compat] invariant compte connecté absent: ${marker}`);
}

for (const file of [gcPath, gc2Path, gc3Path, gc4Path, welcomePath, goodbyePath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[gc-compat] syntaxe invalide ${path.basename(file)}: ${check.stderr || check.stdout}`);
  }
}

for (const file of [welcomePath, goodbyePath, gcPath, gc2Path, gc3Path, gc4Path]) {
  if (/\bbotAdminNeeded\s*:\s*true\b/.test(fs.readFileSync(file, 'utf8'))) {
    throw new Error(`[gc-compat] besoin bot-admin inattendu: ${path.basename(file)}`);
  }
}

console.log('[gc-compat] ✅ compatibilité legacy validée avant unification');

require('./group-status-unified-patch');
require('./group-status-baileys-6722-fix');
require('./group-status-engine-test-patch');
