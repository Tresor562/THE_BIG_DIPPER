'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const pingPath = path.join(BOT, 'commands', 'general_tools', 'ping.js');
const reperePath = path.join(BOT, 'commands', 'bot_sovereignty', 'repere.js');
const handlerPath = path.join(BOT, 'handler.js');
const packagePath = path.join(BOT, 'package.json');
const helperOverride = path.join(ROOT, 'overrides', 'specialPresentation.js');
const helperPath = path.join(BOT, 'utils', 'specialPresentation.js');
const MARKER = '[SPECIAL PREMIUM PRESENTATION]';

for (const file of [menuPath, pingPath, reperePath, handlerPath, packagePath, helperOverride]) {
  if (!fs.existsSync(file)) throw new Error(`[special-presentation] fichier absent: ${file}`);
}

fs.copyFileSync(helperOverride, helperPath);
console.log('[special-presentation] helper premium copié');

function replaceRegexOnce(src, regex, replacement, label, optional = false) {
  const matches = src.match(regex);
  const count = matches ? matches.length : 0;
  if (count === 0 && optional) {
    console.log(`[special-presentation] ${label}: ancre absente, fallback auto-détection utilisé`);
    return src;
  }
  if (count !== 1) {
    throw new Error(`[special-presentation] ${label}: attendu 1 occurrence, trouvé ${count}`);
  }
  return src.replace(regex, replacement);
}

function injectAfterNearby(src, anchorRegex, targetRegex, addition, alreadyMarker, label, windowSize = 900, optional = false) {
  if (src.includes(alreadyMarker)) return src;
  const anchor = src.search(anchorRegex);
  if (anchor < 0) {
    if (optional) {
      console.log(`[special-presentation] ${label}: ancre principale absente, fallback auto-détection utilisé`);
      return src;
    }
    throw new Error(`[special-presentation] ${label}: ancre principale introuvable`);
  }
  const window = src.slice(anchor, anchor + windowSize);
  const target = window.match(targetRegex);
  if (!target || target.index == null) {
    if (optional) {
      console.log(`[special-presentation] ${label}: propriété cible absente, fallback auto-détection utilisé`);
      return src;
    }
    throw new Error(`[special-presentation] ${label}: propriété cible introuvable près de l'ancre`);
  }
  const insertAt = anchor + target.index + target[0].length;
  return src.slice(0, insertAt) + addition + src.slice(insertAt);
}

// ── Menu / Allmenu : carte premium uniquement sur les vues racines.
let menu = fs.readFileSync(menuPath, 'utf8');

if (!menu.includes(MARKER)) {
  menu = replaceRegexOnce(
    menu,
    /imageBuffer:\s*providedImageBuffer\s*=\s*null,\s*\}\s*=\s*options;/,
    "imageBuffer: providedImageBuffer = null,\n    specialPresentation = false,\n    commandName = '',\n  } = options; // [SPECIAL PREMIUM PRESENTATION]",
    'options sendStyledMenuMessage'
  );
}

// Détection indépendante de la structure interne de la branche allmenu.
// Si un futur patch réécrit le bloc `chunks[i]`, le contenu `ALL MENU` suffit.
if (!menu.includes('[ALLMENU PREMIUM AUTO DETECT]')) {
  const hookRegex = /\n\s*const buildRelayNodes\s*=\s*\(\)\s*=>\s*\{/;
  const hookMatch = menu.match(hookRegex);
  if (!hookMatch || hookMatch.index == null) throw new Error('[special-presentation] ancre buildRelayNodes absente');
  const hook = `\n  const autoAllMenuPremium = /(?:^|\\n)\\s*(?:📚\\s*)?\\*?ALL MENU\\b/i.test(String(text || '')); // [ALLMENU PREMIUM AUTO DETECT]\n  if (specialPresentation || autoAllMenuPremium) {\n    const { sendSpecialPresentation } = require('../../utils/specialPresentation');\n    return sendSpecialPresentation(sock, jid, {\n      text,\n      style,\n      imageBuffer,\n      commandName: commandName || (autoAllMenuPremium ? 'allmenu' : 'special'),\n    });\n  }\n`;

  // Remplacer l'ancien hook premium s'il existe déjà, sinon l'insérer.
  const oldHookRegex = /\n\s*if \(specialPresentation\) \{[\s\S]*?commandName:\s*commandName \|\| 'special',\s*\}\);\s*\}/;
  if (oldHookRegex.test(menu)) {
    menu = menu.replace(oldHookRegex, hook.trimEnd());
  } else {
    menu = menu.slice(0, hookMatch.index) + hook + menu.slice(hookMatch.index);
  }
}

// Menu principal : cette branche est stable et doit être explicitement premium.
menu = injectAfterNearby(
  menu,
  /text:\s*menuText\s*,/,
  /withImage:\s*true\s*,/,
  "\n      specialPresentation: true,\n      commandName: 'menu',",
  "commandName: 'menu'",
  'menu principal premium'
);

// Allmenu : optimisation seulement. Si cette branche n'existe pas sous cette
// forme, l'auto-détection ci-dessus assure quand même la présentation premium.
menu = injectAfterNearby(
  menu,
  /text:\s*chunks\s*\[\s*i\s*\]\s*,/,
  /withImage:\s*i\s*===\s*0\s*,/,
  "\n        specialPresentation: i === 0,\n        commandName: 'allmenu',",
  "commandName: 'allmenu'",
  'allmenu premium',
  900,
  true
);

if (!menu.includes('module.exports.getImageBufferForStyle = getImageBufferForStyle;')) {
  menu += "\nmodule.exports.getImageBufferForStyle = getImageBufferForStyle; // [SPECIAL STYLE THUMBNAIL EXPORT]\n";
}
fs.writeFileSync(menuPath, menu, 'utf8');

// ── Ping : même enveloppe premium, panneau système conservé.
let ping = fs.readFileSync(pingPath, 'utf8');
if (!ping.includes('[PING SPECIAL PREMIUM PRESENTATION]')) {
  ping = replaceRegexOnce(
    ping,
    /withImage:\s*false\s*,/,
    "withImage: true,\n          specialPresentation: true, // [PING SPECIAL PREMIUM PRESENTATION]\n          commandName: 'ping',",
    'ping premium'
  );
  fs.writeFileSync(pingPath, ping, 'utf8');
}

// ── Repère : contenu conservé, carte commune + miniature du style actif.
let repere = fs.readFileSync(reperePath, 'utf8');
if (!repere.includes('[REPERE SPECIAL PREMIUM PRESENTATION]')) {
  repere = replaceRegexOnce(
    repere,
    /const config = require\('\.\.\/\.\.\/config'\);/,
    "const config = require('../../config');\nconst styleManager = require('../../utils/styleManager');\nconst { sendSpecialPresentation } = require('../../utils/specialPresentation'); // [REPERE SPECIAL PREMIUM PRESENTATION]",
    'imports repere premium'
  );

  repere = replaceRegexOnce(
    repere,
    /\s*await sendInteractiveRepere\(sock, from, caption, imageBuffer, quoted\);/,
    `\n      const activeStyle = styleManager.getStyle();\n      let styleImage = null;\n      try {\n        const menu = require('../general_tools/menu');\n        if (typeof menu.getImageBufferForStyle === 'function') {\n          styleImage = await menu.getImageBufferForStyle(activeStyle);\n        }\n      } catch (_) {}\n      await sendSpecialPresentation(sock, from, {\n        text: caption,\n        style: activeStyle,\n        imageBuffer: styleImage || imageBuffer || null,\n        commandName: 'repere',\n      });`,
    'envoi repere premium'
  );
  fs.writeFileSync(reperePath, repere, 'utf8');
}

// ── Autres commandes spéciales : interception centrale de leurs réponses texte.
let handler = fs.readFileSync(handlerPath, 'utf8');
if (!handler.includes('[GENERIC SPECIAL COMMAND PRESENTATION]')) {
  const disciplinedAnchor = '    const disciplinedPayload = decoratePayload(payload);';
  if (!handler.includes(disciplinedAnchor)) {
    throw new Error('[special-presentation] handler final sans decoratePayload; exécuter response-style/global-footer avant');
  }
  const genericBlock = `    const disciplinedPayload = decoratePayload(payload);\n\n    // [GENERIC SPECIAL COMMAND PRESENTATION]\n    const specialTrace = commandResponseStorage.getStore();\n    if (specialTrace &&\n        typeof disciplinedPayload?.text === 'string' &&\n        !disciplinedPayload.image && !disciplinedPayload.video &&\n        !disciplinedPayload.audio && !disciplinedPayload.document &&\n        !disciplinedPayload.sticker) {\n      try {\n        const { isSpecialCommand, sendSpecialPresentation } = require('./utils/specialPresentation');\n        if (isSpecialCommand(specialTrace.command)) {\n          const activeStyle = styleManager.getStyle();\n          let styleImage = null;\n          try {\n            const menuModule = require('./commands/general_tools/menu');\n            if (typeof menuModule.getImageBufferForStyle === 'function') {\n              styleImage = await menuModule.getImageBufferForStyle(activeStyle);\n            }\n          } catch (_) {}\n          return await sendSpecialPresentation(sock, jid, {\n            text: disciplinedPayload.text,\n            style: activeStyle,\n            imageBuffer: styleImage,\n            commandName: specialTrace.command,\n          });\n        }\n      } catch (specialErr) {\n        console.warn('[special-presentation] fallback standard ' + (specialTrace?.command || '?') + ': ' + specialErr.message);\n      }\n    }`;
  handler = handler.replace(disciplinedAnchor, genericBlock);
  fs.writeFileSync(handlerPath, handler, 'utf8');
}

// ── Persistance à chaque npm start du bot Render.
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const prestart = String(pkg.scripts?.prestart || '');
if (!prestart.includes('../special-presentation-patch.js')) {
  const verifier = 'node scripts/verify-command-runtime.js';
  const afterGlobal = 'node ../global-footer-patch.js';
  if (prestart.includes(afterGlobal)) {
    pkg.scripts.prestart = prestart.replace(afterGlobal, `${afterGlobal} && node ../special-presentation-patch.js`);
  } else if (prestart.includes(verifier)) {
    pkg.scripts.prestart = prestart.replace(verifier, `node ../special-presentation-patch.js && ${verifier}`);
  } else {
    pkg.scripts.prestart = `${prestart}${prestart ? ' && ' : ''}node ../special-presentation-patch.js`;
  }
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

for (const file of [helperPath, menuPath, pingPath, reperePath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[special-presentation] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalMenu = fs.readFileSync(menuPath, 'utf8');
const finalPing = fs.readFileSync(pingPath, 'utf8');
const finalRepere = fs.readFileSync(reperePath, 'utf8');
const finalHandler = fs.readFileSync(handlerPath, 'utf8');

for (const required of [
  '[SPECIAL PREMIUM PRESENTATION]',
  "commandName: 'menu'",
  '[ALLMENU PREMIUM AUTO DETECT]',
  'module.exports.getImageBufferForStyle = getImageBufferForStyle;',
]) {
  if (!finalMenu.includes(required)) throw new Error(`[special-presentation] menu incomplet: ${required}`);
}
if (!finalPing.includes('[PING SPECIAL PREMIUM PRESENTATION]')) throw new Error('[special-presentation] ping non premium');
if (!finalRepere.includes('[REPERE SPECIAL PREMIUM PRESENTATION]')) throw new Error('[special-presentation] repere non premium');
if (!finalHandler.includes('[GENERIC SPECIAL COMMAND PRESENTATION]')) throw new Error('[special-presentation] handler générique absent');

console.log('[special-presentation] ✅ menu/allmenu/repere/ping + registre de commandes spéciales équipés');
