'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const file = path.join(__dirname, 'bot', 'handler.js');
if (!fs.existsSync(file)) throw new Error('[supreme-react] bot/handler.js absent');
let src = fs.readFileSync(file, 'utf8');

const oldLine = "const emoji = (n % 2 === 1) ? '👨‍💻' : '🤴';";
const newLine = "const emoji = (n % 2 === 1) ? '👨🏾‍💻' : '🤴🏾'; // [SUPREME REACTION DARK TONE]";

if (src.includes(oldLine)) {
  src = src.replace(oldLine, newLine);
  src = src.replace('alternance 👨‍💻/🤴, groupes uniquement', 'alternance 👨🏾‍💻/🤴🏾, groupes uniquement');
  fs.writeFileSync(file, src, 'utf8');
  console.log('[supreme-react] alternance remplacée par 👨🏾‍💻 / 🤴🏾');
} else if (!src.includes(newLine)) {
  throw new Error('[supreme-react] bloc de réaction supreme owner introuvable');
}

const finalSrc = fs.readFileSync(file, 'utf8');
if (!finalSrc.includes(newLine)) throw new Error('[supreme-react] nouvelle alternance absente');
if (finalSrc.includes(oldLine)) throw new Error('[supreme-react] ancienne alternance encore présente');

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[supreme-react] syntaxe handler: ' + (check.stderr || check.stdout));
console.log('[supreme-react] ✅ alternance stricte 👨🏾‍💻 puis 🤴🏾 validée');
