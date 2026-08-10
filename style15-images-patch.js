'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');

if (!fs.existsSync(menuPath)) {
  throw new Error('[style15-images] menu.js introuvable');
}

let src = fs.readFileSync(menuPath, 'utf8');

const urls = [
  'https://i.postimg.cc/3knR077m/31b765be4c48181ec71682f486b873d9-webp.webp',
  'https://i.postimg.cc/R3h0c8VW/352bcb0da908d8dd81e3ecffde24b93b-webp.webp',
  'https://i.postimg.cc/qtq78YMz/36c55390974344a553c0a945efa623ac-webp.webp',
  'https://i.postimg.cc/4Ky3zMNK/b05b777d4a18952d1e0063b6cafaf671-webp.webp',
  'https://i.postimg.cc/KKjYnVvk/ba5f8a3eeb37935c7b74300afcb15317-webp.webp',
];

const marker = '[STYLE 15 DIRECT POSTIMG LINKS]';

if (!src.includes(marker)) {
  const startNeedle = '  // ── Style 15 : Eren Yeager ──────────────────────────────────';
  const endNeedle = '  // ── Style 16 : Itachi Uchiha ────────────────────────────────';

  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('[style15-images] bloc Style 15 introuvable');
  }

  const block = `  // ── Style 15 : Eren Yeager ──────────────────────────────────\n` +
    `  // ${marker}\n` +
    `  // Liens directs d'images uniquement (i.postimg.cc), pas les pages postimg.cc.\n` +
    `  15: [\n` +
    urls.map(url => `    '${url}',`).join('\n') +
    `\n  ],\n\n`;

  src = src.slice(0, start) + block + src.slice(end);
  fs.writeFileSync(menuPath, src);
  console.log('[style15-images] ✅ 5 liens directs installés pour le style 15');
} else {
  console.log('[style15-images] style 15 déjà configuré');
}

const finalSrc = fs.readFileSync(menuPath, 'utf8');
for (const url of urls) {
  if (!finalSrc.includes(url)) {
    throw new Error(`[style15-images] URL absente après patch: ${url}`);
  }
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[style15-images] syntaxe menu.js invalide: ${check.stderr || check.stdout}`);
}

console.log('[style15-images] ✅ Style 15 validé');
