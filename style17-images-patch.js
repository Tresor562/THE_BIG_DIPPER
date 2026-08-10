'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');

if (!fs.existsSync(menuPath)) {
  throw new Error('[style17-images] menu.js introuvable');
}

let src = fs.readFileSync(menuPath, 'utf8');

const urls = [
  'https://i.postimg.cc/Z9vCG2tq/6b5d9409a1839236ca757092e036442e.jpg',
  'https://i.postimg.cc/674ykgJ3/987b4f12c55550b30a3a0736cbe0d67b.jpg',
  'https://i.postimg.cc/yJ3kMt4x/c915530748a8485093b4a285c3dde197.jpg',
  'https://i.postimg.cc/McfvCN2v/f4a8c086d431641edba1a9d4a7e2534b.jpg',
];

const marker = '[STYLE 17 DIRECT POSTIMG LINKS]';

if (!src.includes(marker)) {
  const startNeedle = '  // ── Style 17 : Yhwach ───────────────────────────────────────';
  const endNeedle = '  // ── Style 18 : Business Pro ─────────────────────────────────';

  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('[style17-images] bloc Style 17 introuvable');
  }

  const block = `  // ── Style 17 : Yhwach ───────────────────────────────────────\n` +
    `  // ${marker}\n` +
    `  // Liens directs d'images uniquement (i.postimg.cc), pas les pages postimg.cc.\n` +
    `  17: [\n` +
    urls.map(url => `    '${url}',`).join('\n') +
    `\n  ],\n\n`;

  src = src.slice(0, start) + block + src.slice(end);
  fs.writeFileSync(menuPath, src);
  console.log('[style17-images] ✅ 4 liens directs installés pour le style 17');
} else {
  console.log('[style17-images] style 17 déjà configuré');
}

const finalSrc = fs.readFileSync(menuPath, 'utf8');
for (const url of urls) {
  if (!finalSrc.includes(url)) {
    throw new Error(`[style17-images] URL absente après patch: ${url}`);
  }
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[style17-images] syntaxe menu.js invalide: ${check.stderr || check.stdout}`);
}

console.log('[style17-images] ✅ Style 17 validé');
