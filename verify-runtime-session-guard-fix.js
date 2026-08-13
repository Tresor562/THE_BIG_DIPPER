'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const file = path.join(__dirname, 'bot', 'scripts', 'verify-command-runtime.js');
if (!fs.existsSync(file)) throw new Error('[verify-guard-fix] verifier absent');
let src = fs.readFileSync(file, 'utf8');
const legacy = "else if (config.selfMode)";
const scoped = "else if (runtimeSelfMode)";
if (src.includes(legacy)) {
  src = src.replaceAll(legacy, scoped);
  fs.writeFileSync(file, src, 'utf8');
  console.log('[verify-guard-fix] verifier aligné sur runtimeSelfMode');
} else if (!src.includes(scoped)) {
  throw new Error('[verify-guard-fix] garde self/public introuvable dans le verifier');
}
const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[verify-guard-fix] syntaxe verifier: ' + (check.stderr || check.stdout));
