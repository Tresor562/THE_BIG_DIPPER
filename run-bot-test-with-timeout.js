'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const testPath = process.argv[2];
const timeoutSeconds = Math.max(5, Number(process.argv[3] || 60));

if (!testPath) {
  console.error('[test-timeout] chemin de test requis');
  process.exit(2);
}

const timeoutMs = timeoutSeconds * 1000;
console.log(`[test-timeout] ▶ ${testPath} (limite ${timeoutSeconds}s)`);

const result = spawnSync(process.execPath, ['--test', testPath], {
  cwd: BOT,
  encoding: 'utf8',
  timeout: timeoutMs,
  killSignal: 'SIGKILL',
  env: { ...process.env },
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  const timedOut = result.error.code === 'ETIMEDOUT';
  console.error(timedOut
    ? `[test-timeout] ❌ ${testPath} dépassait ${timeoutSeconds}s — build interrompu au lieu de rester bloqué.`
    : `[test-timeout] ❌ impossible d'exécuter ${testPath}: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[test-timeout] ❌ ${testPath} a échoué avec le code ${result.status}`);
  process.exit(result.status || 1);
}

console.log(`[test-timeout] ✅ ${testPath} terminé sans blocage`);
