'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const sessionManagerPath = path.join(BOT, 'utils', 'sessionManager.js');

if (!fs.existsSync(sessionManagerPath)) {
  throw new Error('[conversation-routing] bot/utils/sessionManager.js introuvable');
}

let src = fs.readFileSync(sessionManagerPath, 'utf8');

const oldListener = `  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify') return;`;
const newListener = `  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    // Baileys multi-device peut livrer les messages envoyés par le propriétaire\n    // depuis son propre téléphone en type='append'. Le bot principal accepte\n    // déjà ce cas ; les sous-sessions doivent avoir exactement le même comportement.\n    if (type !== 'notify' && type !== 'append') return;`;

if (!src.includes(newListener)) {
  const count = src.split(oldListener).length - 1;
  if (count !== 1) {
    throw new Error(`[conversation-routing] listener attendu 1 fois, trouvé ${count}`);
  }
  src = src.replace(oldListener, newListener);
}

const loopAnchor = `    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;`;
const loopReplacement = `    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;\n\n      // Les événements append non-fromMe sont des doublons de synchronisation.\n      // On ne garde append que pour les commandes envoyées par le propriétaire.\n      if (type === 'append' && !msg.key.fromMe) continue;`;

if (!src.includes("if (type === 'append' && !msg.key.fromMe) continue;")) {
  const count = src.split(loopAnchor).length - 1;
  if (count !== 1) {
    throw new Error(`[conversation-routing] boucle messages attendue 1 fois, trouvé ${count}`);
  }
  src = src.replace(loopAnchor, loopReplacement);
}

fs.writeFileSync(sessionManagerPath, src);

const check = spawnSync(process.execPath, ['--check', sessionManagerPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[conversation-routing] syntaxe invalide: ${check.stderr || check.stdout}`);
}

if (!src.includes("if (type !== 'notify' && type !== 'append') return;")) {
  throw new Error('[conversation-routing] support append absent après patch');
}
if (!src.includes("if (type === 'append' && !msg.key.fromMe) continue;")) {
  throw new Error('[conversation-routing] garde anti-doublon append absent');
}

console.log('[conversation-routing] ✅ groupes + privés : notify pour tous, append fromMe pour owner, sous-sessions alignées sur le bot principal');
