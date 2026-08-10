'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const sourceBg = path.join(ROOT, 'overrides', 'welcomeBackground.js');
const targetBg = path.join(BOT, 'utils', 'welcomeBackground.js');
const cardPath = path.join(BOT, 'utils', 'welcomeCard.js');

for (const file of [sourceBg, cardPath]) {
  if (!fs.existsSync(file)) throw new Error(`[welcome-procedural] fichier absent: ${file}`);
}

fs.copyFileSync(sourceBg, targetBg);
console.log('[welcome-procedural] générateur de fonds installé');

let card = fs.readFileSync(cardPath, 'utf8');

function replaceOnce(search, replacement, label) {
  const count = card.split(search).length - 1;
  if (count === 0 && card.includes(replacement)) {
    console.log(`[welcome-procedural] ${label} déjà appliqué`);
    return;
  }
  if (count !== 1) throw new Error(`[welcome-procedural] ${label}: attendu 1 occurrence, trouvé ${count}`);
  card = card.replace(search, replacement);
  console.log(`[welcome-procedural] ${label} appliqué`);
}

replaceOnce(
  "const styleManager = require('./styleManager');",
  "const styleManager = require('./styleManager');\nconst { generateStyleBackground } = require('./welcomeBackground');",
  'import générateur procédural'
);

const oldBackground = `  let background = null;
  try {
    const menu = require('../commands/general_tools/menu');
    if (typeof menu.getImageBufferForStyle === 'function') {
      background = await menu.getImageBufferForStyle(style);
    }
  } catch (_) {}
  if (!background) background = fallbackBackground(style, accent);`;

const newBackground = `  // Fond entièrement généré à chaque événement selon le style actif.
  // Aucune image du menu n'est utilisée comme arrière-plan.
  const background = generateStyleBackground(style, type);`;

replaceOnce(oldBackground, newBackground, 'fond du menu remplacé par génération locale');

fs.writeFileSync(cardPath, card);

for (const file of [targetBg, cardPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[welcome-procedural] syntaxe invalide ${path.basename(file)}: ${check.stderr || check.stdout}`);
  }
}

console.log('[welcome-procedural] ✅ fond unique généré localement selon le style actif pour chaque welcome/goodbye');
