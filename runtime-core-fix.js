'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[runtime-core] bot/ absent — sous-module non cloné.');

function patch(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[runtime-core] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[runtime-core] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(file, src.replace(search, replacement));
  console.log(`[runtime-core] ${label} appliqué`);
}

function check(rel) {
  const file = path.join(BOT, rel);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`[runtime-core] syntaxe invalide ${rel}: ${result.stderr || result.stdout}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU / ALLMENU — jamais bloqué par une longue chaîne d'URLs d'images
// ═══════════════════════════════════════════════════════════════════════════
const menuRel = 'commands/general_tools/menu.js';
const oldMenuFetch = `// Récupère une image personnalisée depuis une URL unique (menu personnalisé).
async function getImageBufferFromUrl(url) {
  if (typeof url !== 'string' && !/^https?:\\/\\//i.test(url)) return null;
}`;

// Le vrai remplacement menu est conservé par les blocs existants du fichier généré.
// Cette sentinelle évite toute réécriture accidentelle de cette section dans ce commit.

const handlerRel = 'handler.js';

for (const rel of ['commands/group_management/tagall.js', 'commands/group_management/hidetag.js']) {
  const file = path.join(BOT, rel);
  if (fs.existsSync(file)) {
    let src = fs.readFileSync(file, 'utf8');
    if (src.includes('botAdminNeeded: true')) {
      src = src.replace('botAdminNeeded: true', 'botAdminNeeded: false, // Mentionner les membres ne nécessite pas les droits admin du bot');
      fs.writeFileSync(file, src, 'utf8');
      check(rel);
    }
  }
}

require('./supreme-owner-reaction-patch');
require('./connected-owner-command-audit-fix');
require('./command-admin-capability-audit');

console.log('[runtime-core] ✅ accès connected-owner + capacités bot-admin audités sur toutes les commandes');
