'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const installer = path.join(BOT, 'scripts', 'install-global-footer.js');

if (!fs.existsSync(installer)) {
  throw new Error('[target-footer-deploy] bot/scripts/install-global-footer.js introuvable');
}

// Le footer n'est plus une décoration globale. Le sous-module contient
// l'installateur ciblé : menu/ping + événements welcome/goodbye uniquement.
const run = spawnSync(process.execPath, [installer], {
  cwd: BOT,
  encoding: 'utf8',
  timeout: 30_000,
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.error) throw new Error('[target-footer-deploy] exécution impossible: ' + run.error.message);
if (run.status !== 0) throw new Error('[target-footer-deploy] installation échouée (' + run.status + ')');

for (const rel of ['utils/specialPresentation.js', 'handler.js']) {
  const file = path.join(BOT, rel);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[target-footer-deploy] syntaxe ${rel}: ${check.stderr || check.stdout}`);
}

const helper = fs.readFileSync(path.join(BOT, 'utils', 'specialPresentation.js'), 'utf8');
const handler = fs.readFileSync(path.join(BOT, 'handler.js'), 'utf8');
if (!helper.includes('[TARGETED CONNECTION FOOTER 2026-08-16]')) {
  throw new Error('[target-footer-deploy] marqueur ciblé absent');
}
if (helper.includes("'pair', 'sessions'") || helper.includes("'repere', 'repère'")) {
  throw new Error('[target-footer-deploy] une commande non ciblée conserve la présentation de connexion globale');
}
if (!handler.includes('[WELCOME TARGETED CONNECTION FOOTER]') || !handler.includes('[GOODBYE TARGETED CONNECTION FOOTER]')) {
  throw new Error('[target-footer-deploy] welcome/goodbye non ciblés');
}

console.log('[target-footer-deploy] ✅ footer limité à menu/ping/welcome/goodbye');
