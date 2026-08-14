'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const source = path.join(ROOT, 'overrides', 'souverain-owner-premium.js');
const target = path.join(BOT, 'commands', 'general_tools', 'souverain.js');

for (const file of [source, target]) {
  if (!fs.existsSync(file)) throw new Error(`[owner-premium] fichier absent: ${file}`);
}

fs.copyFileSync(source, target);

const check = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error('[owner-premium] syntaxe invalide souverain.js: ' + (check.stderr || check.stdout));
}

const final = fs.readFileSync(target, 'utf8');
for (const marker of [
  "name: 'owner'",
  "'2290146202259'",
  "'2290155745907'",
  "display_text: label",
  "forwardedNewsletterMessageInfo",
  "💬 Message",
  "✈️ Telegram",
  "📘 Facebook",
  "📢 Nexus Tech",
  "> Powered by 🌹 Mr Tresor 🌹",
]) {
  if (!final.includes(marker)) throw new Error(`[owner-premium] garde-fou absent: ${marker}`);
}

console.log('[owner-premium] ✅ .owner = 2 vCards + newsletter + CTA sociaux');
