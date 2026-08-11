'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[auth-cache] bot/ absent — sous-module non cloné.');

function patch(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[auth-cache] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[auth-cache] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(file, src.replace(search, replacement));
  console.log(`[auth-cache] ${label} appliqué`);
}

function check(rel) {
  const file = path.join(BOT, rel);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`[auth-cache] syntaxe invalide ${rel}: ${result.stderr || result.stdout}`);
}

// persistence-patch.js a déjà installé le fournisseur Mongo robuste.
// Ici on ajoute uniquement le cache Signal recommandé par Baileys afin de
// ne pas solliciter MongoDB à chaque lecture de clé cryptographique.
patch(
  'utils/sessionManager.js',
  `  fetchLatestWaWebVersion,\n  proto,`,
  `  fetchLatestWaWebVersion,\n  makeCacheableSignalKeyStore,\n  proto,`,
  '  makeCacheableSignalKeyStore,',
  'import makeCacheableSignalKeyStore'
);

patch(
  'utils/sessionManager.js',
  '    auth              : state,',
  `    auth              : {\n      creds: state.creds,\n      keys : makeCacheableSignalKeyStore(state.keys, silentLogger),\n    },`,
  'keys : makeCacheableSignalKeyStore(state.keys, silentLogger)',
  'cache SignalKeyStore'
);

check('utils/sessionManager.js');
console.log('[auth-cache] ✅ cache SignalKeyStore appliqué sans toucher au stockage Mongo');
