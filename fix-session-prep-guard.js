'use strict';
const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, 'session-isolation-prep.js');
let src = fs.readFileSync(target, 'utf8');
const oldLine = "if(mode.includes('process.env." + "SELF_MODE')) throw new Error('[session-isolation-prep] SELF_MODE global encore présent');";
const newLine = "if(!mode.includes(\"const isSelfMode = sessionPreferences.get('selfMode', config.selfMode === true) === true;\")) throw new Error('[session-isolation-prep] lecture selfMode par session absente');";
if (src.includes(oldLine)) {
  src = src.replace(oldLine, newLine);
  fs.writeFileSync(target, src, 'utf8');
  console.log('[prep-guard-fix] validation ciblée installée');
} else if (!src.includes(newLine)) {
  throw new Error('[prep-guard-fix] garde attendu introuvable');
}

// Le postinstall exécute déjà ce script en premier. On chaîne ici le correctif
// de compatibilité du finalizer menu afin qu'il soit appliqué avant les checks
// et avant session-isolation-finalize.js, sans modifier la longue commande npm.
require('./fix-session-finalize-menu-anchor');
