'use strict';
const fs = require('fs');
const path = require('path');
const installer = path.join(__dirname, 'bot', 'scripts', 'install-command-runtime-fixes.js');
if (fs.existsSync(installer)) {
  let src = fs.readFileSync(installer, 'utf8');
  const hook = "require('../../verify-runtime-session-guard-fix');";
  if (src.includes(hook)) {
    src = src.replace(/\n*require\('\.\.\/\.\.\/verify-runtime-session-guard-fix'\);\n*/g, '\n');
    fs.writeFileSync(installer, src, 'utf8');
    console.log('[defer-verifier] hook prématuré retiré de l’installer');
  }
}

// Installer tôt les fonctionnalités de groupe. Le script est idempotent et
// sera rejoué au prestart afin que les overrides survivent aux redémarrages.
require('./group-engagement-patch');
