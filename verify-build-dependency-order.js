'use strict';

const fs = require('fs');
const path = require('path');

function verifyBuildDependencyOrder() {
  const root = __dirname;
  const wrapperPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const botPackage = JSON.parse(fs.readFileSync(path.join(root, 'overrides', 'package.json'), 'utf8'));
  const postinstall = String(wrapperPackage?.scripts?.postinstall || '');

  const installNeedle = 'cd bot && npm install --omit=dev && cd ..';
  const runtimeNeedle = 'node runtime-core-fix.js';
  const installCount = postinstall.split(installNeedle).length - 1;
  const installAt = postinstall.indexOf(installNeedle);
  const runtimeAt = postinstall.indexOf(runtimeNeedle);

  if (installCount !== 1) {
    throw new Error(`[build-order] npm install bot attendu exactement 1 fois, trouvé ${installCount}`);
  }
  if (runtimeAt < 0) {
    throw new Error('[build-order] runtime-core-fix.js absent du postinstall');
  }
  if (installAt < 0 || installAt > runtimeAt) {
    throw new Error('[build-order] les dépendances du bot doivent être installées AVANT runtime-core-fix.js et ses smoke tests');
  }
  if (!botPackage?.dependencies?.dotenv) {
    throw new Error('[build-order] dotenv absent des dépendances du package injecté dans bot/');
  }

  const ownerAudit = fs.readFileSync(path.join(root, 'connected-owner-command-audit-fix.js'), 'utf8');
  if (!ownerAudit.includes("require(path.join(root, 'commands', 'owner_control', file))")) {
    throw new Error('[build-order] forme du smoke owner inattendue; réviser le garde avant de modifier son ordre');
  }

  console.log('[build-order] ✅ dépendances installées avant les audits runtime owner');
  return true;
}

if (require.main === module) verifyBuildDependencyOrder();
module.exports = verifyBuildDependencyOrder;
