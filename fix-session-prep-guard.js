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

require('./fix-session-finalize-menu-anchor');

// Le renderer remplace le sender du menu plus tard dans le pipeline.
// On chaîne le correctif d'image de session à la fin de ce renderer.
const renderer = path.join(__dirname, 'interactive-render-fix.js');
let rendererSrc = fs.readFileSync(renderer, 'utf8');
const hook = "require('./direct-menu-session-image-fix');";
if (!rendererSrc.includes(hook)) {
  rendererSrc += `\n\n${hook}\n`;
  fs.writeFileSync(renderer, rendererSrc, 'utf8');
  console.log('[prep-guard-fix] hook image session ajouté au renderer');
}
