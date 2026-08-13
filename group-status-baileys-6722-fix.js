'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const file = path.join(__dirname, 'bot', 'utils', 'groupStatusEngine.js');
if (!fs.existsSync(file)) throw new Error('[group-status-6722] moteur groupStatusEngine absent');
let src = fs.readFileSync(file, 'utf8');

// Baileys 6.7.22 / WAProto 2.3000.1023047013 expose le champ 96
// `groupStatusMessage` (FutureProofMessage), pas `groupStatusMessageV2`.
// proto.Message.fromObject() ignore un champ inconnu, ce qui expliquait le
// payload undefined observé dans le test Render.
if (src.includes('groupStatusMessageV2')) {
  src = src.replaceAll('groupStatusMessageV2', 'groupStatusMessage');
  fs.writeFileSync(file, src, 'utf8');
  console.log('[group-status-6722] champ protobuf groupStatusMessage appliqué');
}

src = fs.readFileSync(file, 'utf8');
if (!src.includes('groupStatusMessage: {')) {
  throw new Error('[group-status-6722] champ groupStatusMessage absent du moteur final');
}
if (src.includes('groupStatusMessageV2')) {
  throw new Error('[group-status-6722] ancien champ V2 encore présent');
}

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[group-status-6722] syntaxe moteur: ' + (check.stderr || check.stdout));
console.log('[group-status-6722] ✅ moteur aligné sur WAProto Baileys 6.7.22');
