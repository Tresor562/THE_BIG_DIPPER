'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const OLD = '>Powered by 🌹 Mr Tresor 🌹';
const CANONICAL = '> Powered by 🌹 Mr Tresor 🌹';
const targets = [
  path.join(BOT, 'utils', 'responseStyle.js'),
  path.join(BOT, 'utils', 'styleManager.js'),
  path.join(BOT, 'commands', 'general_tools', 'menu.js'),
];

for (const file of targets) {
  if (!fs.existsSync(file)) throw new Error(`[footer-space] fichier absent: ${file}`);
  let src = fs.readFileSync(file, 'utf8');
  src = src.split(OLD).join(CANONICAL);
  fs.writeFileSync(file, src, 'utf8');

  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[footer-space] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
  if (!src.includes(CANONICAL)) {
    throw new Error(`[footer-space] footer canonique absent dans ${path.relative(BOT, file)}`);
  }
}

// Le sanitizer global accepte déjà les anciennes variantes avec ou sans espace
// après '>'. Une fois cette migration appliquée, toute nouvelle réponse finit
// exactement par la forme de citation WhatsApp ci-dessous.
console.log(`[footer-space] ✅ footer canonique: ${CANONICAL}`);
