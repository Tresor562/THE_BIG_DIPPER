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

function replaceOnce(src, search, replacement, label) {
  const count = src.split(search).length - 1;
  if (count === 0 && src.includes(replacement)) return src;
  if (count !== 1) throw new Error(`[special-presentation] ${label}: attendu 1 occurrence, trouvé ${count}`);
  return src.replace(search, replacement);
}

// ── Menu / Allmenu : utiliser la carte premium uniquement pour les vues racines.
let menu = fs.readFileSync(menuPath, 'utf8');
if (!menu.includes(MARKER)) {
  menu = replaceOnce(
    menu,
    "    imageBuffer: providedImageBuffer = null,\n  } = options;",
    "    imageBuffer: providedImageBuffer = null,\n    specialPresentation = false,\n    commandName = '',\n  } = options; // [SPECIAL PREMIUM PRESENTATION]",
    'options sendStyledMenuMessage'
  );

  const specialHookAnchor = "  const buildRelayNodes = () => {";
  const specialHook = `  if (specialPresentation) {\n    const { sendSpecialPresentation } = require('../../utils/specialPresentation');\n    return sendSpecialPresentation(sock, jid, {\n      text,\n      style,\n      imageBuffer,\n      commandName: commandName || 'special',\n    });\n  }\n\n`;
  if (!menu.includes(specialHookAnchor)) throw new Error('[special-presentation] ancre buildRelayNodes absente');
  menu = menu.replace(specialHookAnchor, specialHook + specialHookAnchor);

  const initialNeedle = "      text: menuText,\n      style: styleActif,\n      imageUrl: imageUrl || null,\n      quoted: msg,\n      mentions: [rawSender],\n      withImage: true,";
  const initialReplacement = initialNeedle + "\n      specialPresentation: true,\n      commandName: 'menu',";
  menu = replaceOnce(menu, initialNeedle, initialReplacement, 'menu principal premium');

  const allNeedle = "        text: chunks[i],\n        style: ctx.styleActif,\n        imageUrl: ctx.imageUrl || null,\n        quoted: i === 0 ? msg : null,\n        mentions: [rawSender],\n        withImage: i === 0,";
  const allReplacement = allNeedle + "\n        specialPresentation: i === 0,\n        commandName: 'allmenu',";
  menu = replaceOnce(menu, allNeedle, allReplacement, 'allmenu premium');

  if (!menu.includes('module.exports.getImageBufferForStyle = getImageBufferForStyle;')) {
    menu += "\nmodule.exports.getImageBufferForStyle = getImageBufferForStyle; // [SPECIAL STYLE THUMBNAIL EXPORT]\n";
  }
  fs.writeFileSync(menuPath, menu, 'utf8');
}

// ── Ping : même enveloppe, mais le panneau ping reste le contenu principal.
let ping = fs.readFileSync(pingPath, 'utf8');
if (!ping.includes('[PING SPECIAL PREMIUM PRESENTATION]')) {
  const pingNeedle = "          quoted: from?.endsWith('@g.us') ? msg : null,\n          mentions: [],\n          withImage: false,";
  const pingReplacement = "          quoted: from?.endsWith('@g.us') ? msg : null,\n          mentions: [],\n          withImage: true,\n          specialPresentation: true, // [PING SPECIAL PREMIUM PRESENTATION]\n          commandName: 'ping',";
  ping = replaceOnce(ping, pingNeedle, pingReplacement, 'ping premium');
  fs.writeFileSync(pingPath, ping, 'utf8');
}

// ── Repère : conserve son contenu, ses 3 CTA et sa newsletter, mais utilise
// la miniature du style actif et la carte THE BIG DIPPER commune.
let repere = fs.readFileSync(reperePath, 'utf8');
if (!repere.includes('[REPERE SPECIAL PREMIUM PRESENTATION]')) {
  const configImport = "const config = require('../../config');";
  repere = replaceOnce(
    repere,
    configImport,
    configImport + "\nconst styleManager = require('../../utils/styleManager');\nconst { sendSpecialPresentation } = require('../../utils/specialPresentation'); // [REPERE SPECIAL PREMIUM PRESENTATION]",
    'imports repere premium'
  );

  const callNeedle = "      await sendInteractiveRepere(sock, from, caption, imageBuffer, quoted);";
  const callReplacement = `      const activeStyle = styleManager.getStyle();\n      let styleImage = null;\n      try {\n        const menu = require('../general_tools/menu');\n        if (typeof menu.getImageBufferForStyle === 'function') {\n          styleImage = await menu.getImageBufferForStyle(activeStyle);\n        }\n      } catch (_) {}\n      await sendSpecialPresentation(sock, from, {\n        text: caption,\n        style: activeStyle,\n        imageBuffer: styleImage || imageBuffer || null,\n        commandName: 'repere',\n      });`;
  repere = replaceOnce(repere, callNeedle, callReplacement, 'envoi repere premium');
  fs.writeFileSync(reperePath, repere, 'utf8');
}

// ── Autres commandes spéciales : interception centrale des réponses texte.
// Seules les commandes du registre specialPresentation.js sont concernées.
let handler = fs.readFileSync(handlerPath, 'utf8');
if (!handler.includes('[GENERIC SPECIAL COMMAND PRESENTATION]')) {
  const disciplinedAnchor = "    const disciplinedPayload = decoratePayload(payload);";
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
  if (check.status !== 0) throw new Error(`[special-presentation] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
}

const finalMenu = fs.readFileSync(menuPath, 'utf8');
const finalPing = fs.readFileSync(pingPath, 'utf8');
const finalRepere = fs.readFileSync(reperePath, 'utf8');
const finalHandler = fs.readFileSync(handlerPath, 'utf8');
for (const required of [
  '[SPECIAL PREMIUM PRESENTATION]',
  "commandName: 'menu'",
  "commandName: 'allmenu'",
  'module.exports.getImageBufferForStyle = getImageBufferForStyle;',
]) {
  if (!finalMenu.includes(required)) throw new Error(`[special-presentation] menu incomplet: ${required}`);
}
if (!finalPing.includes('[PING SPECIAL PREMIUM PRESENTATION]')) throw new Error('[special-presentation] ping non premium');
if (!finalRepere.includes('[REPERE SPECIAL PREMIUM PRESENTATION]')) throw new Error('[special-presentation] repere non premium');
if (!finalHandler.includes('[GENERIC SPECIAL COMMAND PRESENTATION]')) throw new Error('[special-presentation] handler générique absent');

console.log('[special-presentation] ✅ menu/allmenu/repere/ping + registre de commandes spéciales équipés');
