'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const HANDLER = path.join(BOT, 'handler.js');
const TARGET_BOT_SHA = '0a90c19fa790c2bf12ccc36c5d0652a654301dba';

function runGit(args, label, cwd = ROOT) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new Error(`[submodule] ${label}: impossible d'exécuter git: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`[submodule] ${label} a échoué (code ${result.status}).`);
}
function runHotInstallerPreflight() {
  const testFile = path.join(BOT, 'tests', 'hot-installer.test.js');
  if (!fs.existsSync(testFile)) throw new Error('[submodule] tests/hot-installer.test.js absent du commit privé candidat.');
  console.log('[submodule] préflight HOT installer...');
  const result = spawnSync(process.execPath, ['--test','tests/hot-installer.test.js'], { cwd:BOT, encoding:'utf8', timeout:45000, killSignal:'SIGKILL' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new Error(`[submodule] préflight HOT interrompu: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`[submodule] préflight HOT échoué (code ${result.status}).`);
  console.log('[submodule] ✅ préflight HOT installer validé');
}
function ensureBotSubmodule() {
  if (!fs.existsSync(path.join(ROOT,'.gitmodules'))) throw new Error('[submodule] .gitmodules absent : impossible de récupérer bot/.');
  console.log('[submodule] synchronisation + remise à zéro déterministe de bot/...');
  runGit(['submodule','sync','--recursive'],'git submodule sync');
  runGit(['submodule','update','--init','--recursive','--force'],'git submodule update --force');
  if (!fs.existsSync(HANDLER)) throw new Error('[submodule] bot/handler.js absent après git submodule update.');
  console.log(`[submodule] ciblage explicite DIPPER- @ ${TARGET_BOT_SHA.slice(0,12)} via origin authentifié...`);
  runGit(['fetch','--no-tags','origin',TARGET_BOT_SHA],'git fetch révision bot',BOT);
  runGit(['checkout','--detach','--force','FETCH_HEAD'],'git checkout révision bot',BOT);
  runGit(['reset','--hard','FETCH_HEAD'],'git reset révision bot',BOT);
  runGit(['clean','-fd'],'git clean bot',BOT);
  const rev=spawnSync('git',['rev-parse','HEAD'],{cwd:BOT,encoding:'utf8'});
  const fullSha=rev.status===0?String(rev.stdout||'').trim():'';
  if(fullSha!==TARGET_BOT_SHA) throw new Error(`[submodule] mauvaise révision bot après checkout: ${fullSha||'inconnue'} (attendue ${TARGET_BOT_SHA})`);
  const dirty=spawnSync('git',['status','--porcelain'],{cwd:BOT,encoding:'utf8'});
  if(dirty.status!==0) throw new Error('[submodule] impossible de vérifier la propreté de bot/.');
  if(String(dirty.stdout||'').trim()) throw new Error('[submodule] bot/ reste modifié après reset — build refusé.');
  console.log(`[submodule] ✅ bot/ propre @ ${TARGET_BOT_SHA.slice(0,12)} (révision Render forcée)`);
  require('./verify-build-dependency-order')();
  runHotInstallerPreflight();
}
if(require.main===module) ensureBotSubmodule();
module.exports=ensureBotSubmodule;
