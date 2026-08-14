'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const responseStyle = path.join(BOT, 'utils', 'responseStyle.js');
const styleManager = path.join(BOT, 'utils', 'styleManager.js');
const SITE = 'https://the-big-dipper.onrender.com';
const HINT = `🌐 Connecte aussi ton bot : ${SITE}`;
const MARKER = '[WEBSITE CONNECT HINT]';

function patchFooter(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARKER)) return;
  const old = "const GLOBAL_FOOTER = '> Powered by 🌹 Mr Tresor 🌹'; // [GLOBAL QUOTED FOOTER — MR TRESOR]";
  const replacement = `const WEBSITE_CONNECT_HINT = '${HINT}'; // ${MARKER}\nconst GLOBAL_FOOTER = '> Powered by 🌹 Mr Tresor 🌹\\n' + WEBSITE_CONNECT_HINT; // [GLOBAL QUOTED FOOTER — MR TRESOR]`;
  const count = src.split(old).length - 1;
  if (count !== 1) throw new Error(`[website-hint] GLOBAL_FOOTER attendu 1 fois dans ${path.basename(file)}, trouvé ${count}`);
  src = src.replace(old, replacement);

  // responseStyle.ensureGlobalFooter() retire aussi une ancienne occurrence du lien
  // avant d'ajouter le footer, pour éviter les doublons lors des wrappers successifs.
  if (file === responseStyle) {
    const filterOld = "    return !/^>?\\s*powered by\\s+🌹.*🌹$/iu.test(compact);";
    const filterNew = "    return !/^>?\\s*powered by\\s+🌹.*🌹$/iu.test(compact) && !/the-big-dipper\\.onrender\\.com/iu.test(compact);";
    if (src.includes(filterOld)) src = src.replace(filterOld, filterNew);
  }
  fs.writeFileSync(file, src, 'utf8');
}

for (const file of [responseStyle, styleManager]) {
  if (!fs.existsSync(file)) throw new Error(`[website-hint] absent: ${file}`);
  patchFooter(file);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[website-hint] syntaxe ${path.basename(file)}: ${r.stderr || r.stdout}`);
}

for (const file of [responseStyle, styleManager]) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes(SITE) || !src.includes(MARKER)) throw new Error(`[website-hint] garde-fou absent: ${file}`);
}

console.log(`[website-hint] ✅ lien de connexion universel actif: ${SITE}`);
