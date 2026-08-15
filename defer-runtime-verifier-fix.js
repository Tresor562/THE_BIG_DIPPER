'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');

const installer = path.join(BOT, 'scripts', 'install-command-runtime-fixes.js');
if (fs.existsSync(installer)) {
  let src = fs.readFileSync(installer, 'utf8');
  const hook = "require('../../verify-runtime-session-guard-fix');";
  if (src.includes(hook)) {
    src = src.replace(/\n*require\('\.\.\/\.\.\/verify-runtime-session-guard-fix'\);\n*/g, '\n');
    fs.writeFileSync(installer, src, 'utf8');
    console.log('[defer-verifier] hook prématuré retiré de l’installer');
  }
}

// [PAIRING BUILD COMPAT]
// Le nouveau moteur installé dans DIPPER- (install-pairing-resilience.js)
// gère déjà : version WhatsApp Web live, délais de préparation, timeouts et
// retries transitoires 408/428/515. L'ancien pairing-handshake-fix.js repose
// sur des regex qui ciblent l'ancienne implémentation de requestPairingCode
// (délai 3000 ms + timeout 20000 ms) et fait échouer le build dès que le
// nouveau moteur a déjà transformé ce bloc.
//
// On retire donc l'ancien patch + son vérificateur de prestart/validate
// UNIQUEMENT lorsque le nouveau moteur de résilience est réellement présent.
// Les fichiers legacy restent dans le dépôt : aucun effacement de fonctionnalité
// n'est fait pour une ancienne révision de bot qui ne possède pas le remplaçant.
const resilienceInstaller = path.join(BOT, 'scripts', 'install-pairing-resilience.js');
const overridePackage = path.join(ROOT, 'overrides', 'package.json');
if (fs.existsSync(resilienceInstaller) && fs.existsSync(overridePackage)) {
  const pkg = JSON.parse(fs.readFileSync(overridePackage, 'utf8'));
  const legacyChain = 'node ../pairing-handshake-fix.js && node ../pairing-handshake-verify.js && ';
  let changed = false;

  for (const scriptName of ['prestart', 'validate:commands']) {
    const value = pkg.scripts?.[scriptName];
    if (typeof value !== 'string') continue;
    if (value.includes(legacyChain)) {
      pkg.scripts[scriptName] = value.split(legacyChain).join('');
      changed = true;
      console.log(`[pairing-build-compat] legacy handshake retiré de ${scriptName}`);
    }
  }

  if (changed) {
    fs.writeFileSync(overridePackage, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }

  // Garde-fou : le nouveau moteur doit rester dans le sous-module.
  const resilienceSource = fs.readFileSync(resilienceInstaller, 'utf8');
  for (const marker of ['[PAIRING TRANSIENT RETRY]', '[PAIRING READY GRACE]']) {
    if (!resilienceSource.includes(marker)) {
      throw new Error(`[pairing-build-compat] moteur résilient incomplet: ${marker}`);
    }
  }
  console.log('[pairing-build-compat] ✅ nouveau moteur pairing prioritaire; ancien patch regex désactivé');
}

// Installer tôt les fonctionnalités de groupe. Le script est idempotent et
// sera rejoué au prestart afin que les overrides survivent aux redémarrages.
require('./group-engagement-patch');
