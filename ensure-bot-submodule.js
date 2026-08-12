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

function ensureBotSubmodule() {
  if (fs.existsSync(HANDLER)) {
    console.log('[submodule] ✅ bot/ déjà initialisé');
    return;
  }

  console.log('[submodule] bot/ incomplet — initialisation forcée du sous-module privé DIPPER-...');

  if (!fs.existsSync(path.join(ROOT, '.gitmodules'))) {
    throw new Error('[submodule] .gitmodules absent : impossible de récupérer bot/.');
  }

  runGit(['submodule', 'sync', '--recursive'], 'git submodule sync');
  runGit(['submodule', 'update', '--init', '--recursive', '--force'], 'git submodule update');

  if (!fs.existsSync(HANDLER)) {
    throw new Error(
      '[submodule] bot/handler.js toujours absent après git submodule update. ' +
      'Render doit avoir accès au dépôt privé Tresor562/DIPPER-. ' +
      'Dans Render, reconnecte/autorise le compte GitHub de déploiement sur ce dépôt privé.'
    );
  }

  const rev = spawnSync('git', ['-C', BOT, 'rev-parse', '--short=12', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const sha = rev.status === 0 ? String(rev.stdout || '').trim() : '';
  console.log(`[submodule] ✅ bot/ initialisé${sha ? ` @ ${sha}` : ''}`);
}

if (require.main === module) ensureBotSubmodule();

module.exports = ensureBotSubmodule;
