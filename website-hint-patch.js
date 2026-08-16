'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const specialPresentation = path.join(BOT, 'utils', 'specialPresentation.js');
const handler = path.join(BOT, 'handler.js');
const SITE = 'https://the-big-dipper.onrender.com';
const FOOTER = '> Powered by 🌹 Mr Tresor 🌹';
const HINT = `🌐 Connecte aussi ton bot : ${SITE}`;
const MARKER = '[WEBSITE CONNECT HINT]';

function syntaxCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`[website-hint] syntaxe ${path.basename(file)}: ${result.stderr || result.stdout}`);
  }
}

function patchSpecialPresentation() {
  let src = fs.readFileSync(specialPresentation, 'utf8');
  if (src.includes(MARKER) && src.includes(SITE)) return;

  // install-global-footer.js applique désormais le footer uniquement aux commandes
  // menu/ping/etc. via displayText. L'ancien website-hint-patch cherchait encore
  // GLOBAL_FOOTER dans responseStyle/styleManager, symbole qui n'existe plus.
  const target = `String(text).trim() + '\\n\\n${FOOTER}'`;
  const replacement = `String(text).trim() + '\\n\\n${FOOTER}\\n${HINT}' /* ${MARKER} */`;
  const count = src.split(target).length - 1;

  if (count === 1) {
    src = src.replace(target, replacement);
  } else if (count === 0 && src.includes(SITE)) {
    // Une révision future peut avoir déjà intégré le lien sans notre marqueur.
    // Dans ce cas on considère la cible fonctionnellement déjà patchée.
    console.log('[website-hint] specialPresentation contient déjà le site');
  } else {
    throw new Error(`[website-hint] footer ciblé specialPresentation attendu 1 fois, trouvé ${count}`);
  }

  fs.writeFileSync(specialPresentation, src, 'utf8');
}

function patchWelcomeGoodbye() {
  let src = fs.readFileSync(handler, 'utf8');
  if (src.includes(MARKER) && src.includes(SITE)) return;

  // Le footer welcome/goodbye est injecté par install-global-footer.js dans les
  // captions et fallbacks texte. On enrichit seulement ces occurrences ciblées.
  const escapedFooter = FOOTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const footerLiteralRe = new RegExp(escapedFooter, 'g');
  const matches = src.match(footerLiteralRe) || [];

  if (matches.length > 0) {
    src = src.replace(footerLiteralRe, `${FOOTER}\\n${HINT}`);
    // Marqueur placé à côté d'un marqueur de footer ciblé existant, sans changer
    // le texte envoyé à l'utilisateur.
    if (src.includes('[WELCOME TARGETED CONNECTION FOOTER]')) {
      src = src.replace('[WELCOME TARGETED CONNECTION FOOTER]', `[WELCOME TARGETED CONNECTION FOOTER] ${MARKER}`);
    } else {
      src += `\n// ${MARKER}\n`;
    }
  } else if (src.includes(SITE)) {
    console.log('[website-hint] handler contient déjà le site');
  } else {
    throw new Error('[website-hint] footer welcome/goodbye ciblé introuvable dans handler.js');
  }

  fs.writeFileSync(handler, src, 'utf8');
}

for (const file of [specialPresentation, handler]) {
  if (!fs.existsSync(file)) throw new Error(`[website-hint] absent: ${file}`);
}

patchSpecialPresentation();
patchWelcomeGoodbye();

for (const file of [specialPresentation, handler]) syntaxCheck(file);

const specialSrc = fs.readFileSync(specialPresentation, 'utf8');
const handlerSrc = fs.readFileSync(handler, 'utf8');
if (!specialSrc.includes(SITE)) throw new Error('[website-hint] lien absent de specialPresentation.js');
if (!handlerSrc.includes(SITE)) throw new Error('[website-hint] lien absent de handler.js');

console.log(`[website-hint] ✅ lien de connexion actif sur les footers ciblés: ${SITE}`);
