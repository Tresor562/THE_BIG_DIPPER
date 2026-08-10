'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');

if (!fs.existsSync(menuPath)) {
  throw new Error('[style18-images] menu.js introuvable');
}

let src = fs.readFileSync(menuPath, 'utf8');

const urls = [
  'https://i.postimg.cc/9zLwqGph/3369205534fe898c797e57d388cf4e2b-webp.webp',
  'https://i.postimg.cc/w3wRshVx/50514d86611161a207687d0afb1b7080-webp.webp',
  'https://i.postimg.cc/230LB4wC/52e2f0a4e24e91af65fd8d8abb8a4b4d-webp.webp',
  'https://i.postimg.cc/Z0wvyrc4/58b56dcca21314d648c1af71cfd2d0aa-webp.webp',
  'https://i.postimg.cc/jCMnJzXs/c806d58879926807151297a162228544-webp.webp',
  'https://i.postimg.cc/RqgJncRZ/f1c70b7e5e96f933da55ec9473520cd3-webp.webp',
];

const marker = '[STYLE 18 DIRECT POSTIMG LINKS]';

if (!src.includes(marker)) {
  const startNeedle = '  // ── Style 18 : Business Pro ─────────────────────────────────';
  const endNeedle = '  // ── Style 19 : Shadow Merchant ──────────────────────────────';

  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('[style18-images] bloc Style 18 introuvable');
  }

  const block = `  // ── Style 18 : Business Pro ─────────────────────────────────\n` +
    `  // ${marker}\n` +
    `  // Liens directs d'images uniquement (i.postimg.cc), pas les pages postimg.cc.\n` +
    `  18: [\n` +
    urls.map(url => `    '${url}',`).join('\n') +
    `\n  ],\n\n`;

  src = src.slice(0, start) + block + src.slice(end);
  fs.writeFileSync(menuPath, src);
  console.log('[style18-images] ✅ 6 liens directs installés pour le style 18');
} else {
  console.log('[style18-images] style 18 déjà configuré');
}

const finalSrc = fs.readFileSync(menuPath, 'utf8');
for (const url of urls) {
  if (!finalSrc.includes(url)) {
    throw new Error(`[style18-images] URL absente après patch: ${url}`);
  }
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[style18-images] syntaxe menu.js invalide: ${check.stderr || check.stdout}`);
}

console.log('[style18-images] ✅ Style 18 validé');
