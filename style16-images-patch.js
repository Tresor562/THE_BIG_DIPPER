'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');

if (!fs.existsSync(menuPath)) {
  throw new Error('[style16-images] menu.js introuvable');
}

let src = fs.readFileSync(menuPath, 'utf8');

const urls = [
  'https://i.postimg.cc/B8SmNTdp/2fbea2e9c1b834f7e7f934ff519ee4db-webp.webp',
  'https://i.postimg.cc/94mL1dvs/4dccc61a0e6bd65a8360568d3f8e6326-webp.webp',
  'https://i.postimg.cc/QB8fSQRw/9228a68a15da2dbc1fecf45394c06c5b-webp.webp',
  'https://i.postimg.cc/WDN5SGQH/dcebed36d2df6a85b7289e605f285719-webp.webp',
  'https://i.postimg.cc/FfrTGy2q/fd1eea2f158fb77d35f90a92bb8f7416-webp.webp',
];

const marker = '[STYLE 16 DIRECT POSTIMG LINKS]';

if (!src.includes(marker)) {
  const startNeedle = '  // ── Style 16 : Itachi Uchiha ────────────────────────────────';
  const endNeedle = '  // ── Style 17 : Yhwach ───────────────────────────────────────';

  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('[style16-images] bloc Style 16 introuvable');
  }

  const block = `  // ── Style 16 : Itachi Uchiha ────────────────────────────────\n` +
    `  // ${marker}\n` +
    `  // Liens directs d'images uniquement (i.postimg.cc), pas les pages postimg.cc.\n` +
    `  16: [\n` +
    urls.map(url => `    '${url}',`).join('\n') +
    `\n  ],\n\n`;

  src = src.slice(0, start) + block + src.slice(end);
  fs.writeFileSync(menuPath, src);
  console.log('[style16-images] ✅ 5 liens directs installés pour le style 16');
} else {
  console.log('[style16-images] style 16 déjà configuré');
}

const finalSrc = fs.readFileSync(menuPath, 'utf8');
for (const url of urls) {
  if (!finalSrc.includes(url)) {
    throw new Error(`[style16-images] URL absente après patch: ${url}`);
  }
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[style16-images] syntaxe menu.js invalide: ${check.stderr || check.stdout}`);
}

console.log('[style16-images] ✅ Style 16 validé');
