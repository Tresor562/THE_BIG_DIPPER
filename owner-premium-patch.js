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
  "https://t.me/tresor20009",
  "https://www.facebook.com/profile.php?id=100078681750878",
  "https://www.tiktok.com/@tresor20001",
  "https://www.instagram.com/tresorhtn",
  "https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07",
  "forwardedNewsletterMessageInfo",
  "💬 Message",
  "✈️ Telegram",
  "📘 Facebook",
  "🎵 TikTok",
  "📸 Instagram",
  "📢 Nexus Tech",
  "> Powered by 🌹 Mr Tresor 🌹",
]) {
  if (!final.includes(marker)) throw new Error(`[owner-premium] garde-fou absent: ${marker}`);
}

// Compte uniquement les appels réels urlButton('...') dans buildButtons().
// La déclaration `function urlButton(...)` ne matche pas ce motif, donc
// il ne faut rien soustraire ici.
const buttonCount = (final.match(/urlButton\('/g) || []).length;
if (buttonCount !== 6) throw new Error(`[owner-premium] 6 CTA attendus par contact, trouvé ${buttonCount}`);

console.log('[owner-premium] ✅ .owner = 2 vCards + newsletter + 6 CTA vérifiés par contact');
