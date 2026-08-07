'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const OVERRIDES = path.join(ROOT, 'overrides');

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function copy(src, dest) {
  ensureParent(dest);
  fs.copyFileSync(src, dest);
  console.log(`[prepare] ${path.relative(ROOT, dest)}`);
}

if (!fs.existsSync(BOT)) {
  throw new Error('Le sous-module privé bot/ est absent. Vérifie que Render a accès à Tresor562/DIPPER-.');
}

// Conserver exactement le .env fourni pour le déploiement privé.
copy(path.join(ROOT, '.env'), path.join(BOT, '.env'));

// Reproduire les fichiers ajoutés/corrigés dans l’archive auditée.
copy(path.join(OVERRIDES, 'package.json'), path.join(BOT, 'package.json'));
copy(path.join(OVERRIDES, 'gc2.js'), path.join(BOT, 'commands/group_management/gc2.js'));
copy(path.join(OVERRIDES, 'gc3.js'), path.join(BOT, 'commands/group_management/gc3.js'));
copy(path.join(OVERRIDES, 'gc4.js'), path.join(BOT, 'commands/group_management/gc4.js'));

// Remplacer uniquement la section images/fetch de menu.js afin de conserver
// tout le reste de la version du bot tout en appliquant l’audit demandé.
const menuPath = path.join(BOT, 'commands/general_tools/menu.js');
let menu = fs.readFileSync(menuPath, 'utf8');
const replacement = fs.readFileSync(path.join(OVERRIDES, 'menu-image-block.txt'), 'utf8').trimEnd() + '\n\n';
const startMarker = '// ══════════════════════════════════════════════════════════════\n// 🖼️  IMAGES DU MENU';
const endMarker = '// ── Définitions des styles ──';
const start = menu.indexOf(startMarker);
const end = menu.indexOf(endMarker);
if (start === -1 || end === -1 || end <= start) {
  throw new Error('Impossible de localiser la section images de menu.js; arrêt pour éviter une modification incorrecte.');
}
menu = menu.slice(0, start) + replacement + menu.slice(end);
fs.writeFileSync(menuPath, menu);
console.log('[prepare] commands/general_tools/menu.js audité');

// Ces dossiers sont nécessaires aux deux modes d’authentification. Ils sont
// créés même s’ils ne contiennent encore aucune session dans l’archive.
fs.mkdirSync(path.join(BOT, 'sessions'), { recursive: true });
fs.mkdirSync(path.join(BOT, 'auth_info_baileys'), { recursive: true });

console.log('[prepare] THE BIG DIPPER prêt.');
