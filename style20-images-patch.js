'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');

if (!fs.existsSync(menuPath)) {
  throw new Error('[style20-images] menu.js introuvable');
}

let src = fs.readFileSync(menuPath, 'utf8');

const urls = [
  'https://i.postimg.cc/bsYMmjks/12f5ce20e8e584016bdf0047f5b7460a.jpg',
  'https://i.postimg.cc/CzMtcVkZ/27183ac35cfa437734d23a8c953ed68d.jpg',
  'https://i.postimg.cc/9rXSLjZR/f72ba40ad2eef4af5e6f0e20f4f6d1f2.jpg',
];

const marker = '[STYLE 20 DIRECT POSTIMG LINKS]';

if (!src.includes(marker)) {
  const startNeedle = '  // ── Style 20 : Purgeur Suprême ──────────────────────────────';
  const endNeedle = '};';

  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('[style20-images] bloc Style 20 introuvable');
  }

  const block = `  // ── Style 20 : Purgeur Suprême ──────────────────────────────\n` +
    `  // ${marker}\n` +
    `  // Liens directs d'images uniquement (i.postimg.cc), pas les pages postimg.cc.\n` +
    `  20: [\n` +
    urls.map(url => `    '${url}',`).join('\n') +
    `\n  ],\n`;

  src = src.slice(0, start) + block + src.slice(end);
  fs.writeFileSync(menuPath, src);
  console.log('[style20-images] ✅ 3 liens directs installés pour le style 20');
} else {
  console.log('[style20-images] style 20 déjà configuré');
}

const finalSrc = fs.readFileSync(menuPath, 'utf8');
for (const url of urls) {
  if (!finalSrc.includes(url)) {
    throw new Error(`[style20-images] URL absente après patch: ${url}`);
  }
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[style20-images] syntaxe menu.js invalide: ${check.stderr || check.stdout}`);
}

console.log('[style20-images] ✅ Style 20 validé');
