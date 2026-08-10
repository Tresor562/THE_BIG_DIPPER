'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');

if (!fs.existsSync(menuPath)) {
  throw new Error('[style19-images] menu.js introuvable');
}

let src = fs.readFileSync(menuPath, 'utf8');

const urls = [
  'https://i.postimg.cc/T5KdbWRH/15fcf92720a3636cdfc7c1d15f149e70-webp.webp',
  'https://i.postimg.cc/7J5HzTxc/2a8941d66cd10223b1cbbdde25d4fa44.jpg',
  'https://i.postimg.cc/CnRh8fFX/7112ef664def03606bc7897f246781c0-webp.webp',
  'https://i.postimg.cc/LgJ9PZHr/9eaebc9d4cb8c98edfcdafce292cfcf7-webp.webp',
  'https://i.postimg.cc/fSVzd0wG/d7c0e935f8642655a9fa0cffeba53800.jpg',
];

const marker = '[STYLE 19 DIRECT POSTIMG LINKS]';

if (!src.includes(marker)) {
  const startNeedle = '  // ── Style 19 : Shadow Merchant ──────────────────────────────';
  const endNeedle = '  // ── Style 20 : Purgeur Suprême ──────────────────────────────';

  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('[style19-images] bloc Style 19 introuvable');
  }

  const block = `  // ── Style 19 : Shadow Merchant ──────────────────────────────\n` +
    `  // ${marker}\n` +
    `  // Liens directs d'images uniquement (i.postimg.cc), pas les pages postimg.cc.\n` +
    `  19: [\n` +
    urls.map(url => `    '${url}',`).join('\n') +
    `\n  ],\n\n`;

  src = src.slice(0, start) + block + src.slice(end);
  fs.writeFileSync(menuPath, src);
  console.log('[style19-images] ✅ 5 liens directs installés pour le style 19');
} else {
  console.log('[style19-images] style 19 déjà configuré');
}

const finalSrc = fs.readFileSync(menuPath, 'utf8');
for (const url of urls) {
  if (!finalSrc.includes(url)) {
    throw new Error(`[style19-images] URL absente après patch: ${url}`);
  }
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[style19-images] syntaxe menu.js invalide: ${check.stderr || check.stdout}`);
}

console.log('[style19-images] ✅ Style 19 validé');
