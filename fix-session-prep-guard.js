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

const renderer = path.join(__dirname, 'interactive-render-fix.js');
let rendererSrc = fs.readFileSync(renderer, 'utf8');
const hook = "require('./direct-menu-session-image-fix');";
if (!rendererSrc.includes(hook)) {
  rendererSrc += `\n\n${hook}\n`;
  fs.writeFileSync(renderer, rendererSrc, 'utf8');
  console.log('[prep-guard-fix] hook image session ajouté au renderer');
}

// Le sous-module conserve un verifier historique qui exige encore config.selfMode.
// Le runtime final utilise runtimeSelfMode, isolé par session : aligner le verifier
// avant les validations de build ET avant le prestart exécuté sur Render.
const installer = path.join(__dirname, 'bot', 'scripts', 'install-command-runtime-fixes.js');
if (fs.existsSync(installer)) {
  let installerSrc = fs.readFileSync(installer, 'utf8');
  const verifyHook = "require('../../verify-runtime-session-guard-fix');";
  if (!installerSrc.includes(verifyHook)) {
    installerSrc += `\n\n${verifyHook}\n`;
    fs.writeFileSync(installer, installerSrc, 'utf8');
    console.log('[prep-guard-fix] hook verifier runtime ajouté à installer');
  }
}
