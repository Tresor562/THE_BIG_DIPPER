'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const HANDLER = path.join(BOT, 'handler.js');

function runGit(args, label) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    throw new Error(`[submodule] ${label}: impossible d'exécuter git: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[submodule] ${label} a échoué (code ${result.status}).`);
  }
}

function runHotInstallerPreflight() {
  const testFile = path.join(BOT, 'tests', 'hot-installer.test.js');
  if (!fs.existsSync(testFile)) {
    throw new Error('[submodule] tests/hot-installer.test.js absent du commit privé candidat.');
  }

  console.log('[submodule] préflight HOT installer...');
  const result = spawnSync(process.execPath, ['--test', 'tests/hot-installer.test.js'], {
    cwd: BOT,
    encoding: 'utf8',
    timeout: 45_000,
    killSignal: 'SIGKILL',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    throw new Error(`[submodule] préflight HOT interrompu: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[submodule] préflight HOT échoué (code ${result.status}).`);
  }
  console.log('[submodule] ✅ préflight HOT installer validé');
}

function ensureBotSubmodule() {
  if (!fs.existsSync(path.join(ROOT, '.gitmodules'))) {
    throw new Error('[submodule] .gitmodules absent : impossible de récupérer bot/.');
  }

  // Toujours repartir du commit exact enregistré par le wrapper.
  // Render peut réutiliser des caches de build : si une tentative précédente
  // a laissé bot/ partiellement patché, sauter cette étape rend les patches
  // suivants non déterministes (ancres trouvées 0 ou plusieurs fois).
  console.log('[submodule] synchronisation + remise à zéro déterministe de bot/...');
  runGit(['submodule', 'sync', '--recursive'], 'git submodule sync');
  runGit(['submodule', 'update', '--init', '--recursive', '--force'], 'git submodule update --force');

  if (!fs.existsSync(HANDLER)) {
    throw new Error(
      '[submodule] bot/handler.js absent après git submodule update. ' +
      'Render doit avoir accès au dépôt privé Tresor562/DIPPER-.'
    );
  }

  // Supprime uniquement les fichiers non suivis laissés par d'anciens builds.
  // Les fichiers ignorés (par ex. node_modules cache) sont conservés pour ne
  // pas rallonger inutilement les installations.
  runGit(['-C', BOT, 'clean', '-fd'], 'git clean bot');

  const rev = spawnSync('git', ['-C', BOT, 'rev-parse', '--short=12', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const sha = rev.status === 0 ? String(rev.stdout || '').trim() : '';

  const dirty = spawnSync('git', ['-C', BOT, 'status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (dirty.status !== 0) {
    throw new Error('[submodule] impossible de vérifier la propreté de bot/.');
  }
  if (String(dirty.stdout || '').trim()) {
    throw new Error('[submodule] bot/ reste modifié après reset — build refusé pour éviter un état indéterministe.');
  }

  console.log(`[submodule] ✅ bot/ propre${sha ? ` @ ${sha}` : ''}`);
  require('./verify-build-dependency-order')();
  runHotInstallerPreflight();
}

if (require.main === module) ensureBotSubmodule();

module.exports = ensureBotSubmodule;
