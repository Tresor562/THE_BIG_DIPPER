'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, 'bot');
const responseStylePath = path.join(ROOT, 'utils', 'responseStyle.js');
const styleManagerPath = path.join(ROOT, 'utils', 'styleManager.js');
const menuPath = path.join(ROOT, 'commands', 'general_tools', 'menu.js');
const handlerPath = path.join(ROOT, 'handler.js');
const packagePath = path.join(ROOT, 'package.json');
const LEGACY_FOOTER = '>Powered by 🌹 Mr Tresor 🌹';
const FOOTER = '> Powered by 🌹 Mr Tresor 🌹';
const MARKER = '[GLOBAL QUOTED FOOTER — MR TRESOR]';

for (const file of [responseStylePath, styleManagerPath, menuPath, handlerPath, packagePath]) {
  if (!fs.existsSync(file)) throw new Error(`[global-footer] fichier absent: ${file}`);
}

let rs = fs.readFileSync(responseStylePath, 'utf8');
if (!rs.includes(MARKER)) {
  const profilesAnchor = 'const PROFILES = {';
  if (!rs.includes(profilesAnchor)) throw new Error('[global-footer] PROFILES introuvable');
  rs = rs.replace(profilesAnchor, `const GLOBAL_FOOTER = '${FOOTER}'; // ${MARKER}\n\n${profilesAnchor}`);

  const getProfileOld = `function getProfile(style) {\n  return PROFILES[activeStyle(style)] || PROFILES[0];\n}`;
  const getProfileNew = `function getProfile(style) {\n  const profile = PROFILES[activeStyle(style)] || PROFILES[0];\n  return { ...profile, signature: GLOBAL_FOOTER };\n}`;
  if (!rs.includes(getProfileOld)) throw new Error('[global-footer] getProfile introuvable');
  rs = rs.replace(getProfileOld, getProfileNew);

  const sanitizeAnchor = `function sanitizeLegacyText(text, style) {\n  if (typeof text !== 'string' || !text) return text;`;
  const sanitizeReplacement = `function sanitizeLegacyText(text, style) {\n  if (typeof text !== 'string' || !text) return text;\n  text = String(text).split('\\n').map(line => {\n    const compact = line.trim().replace(/\\*/g, '');\n    if (/^>?\\s*powered by\\s+🌹.*🌹$/iu.test(compact)) return GLOBAL_FOOTER;\n    return line;\n  }).join('\\n');`;
  if (!rs.includes(sanitizeAnchor)) throw new Error('[global-footer] sanitizeLegacyText introuvable');
  rs = rs.replace(sanitizeAnchor, sanitizeReplacement);

  const decorateAnchor = `function decoratePayload(payload, style) {`;
  if (!rs.includes(decorateAnchor)) throw new Error('[global-footer] decoratePayload introuvable');
  const helpers = `function ensureGlobalFooter(text) {\n  if (typeof text !== 'string' || !text.trim()) return text;\n  const lines = String(text).replace(/\\r\\n/g, '\\n').split('\\n');\n  const kept = lines.filter(line => {\n    const compact = line.trim().replace(/\\*/g, '');\n    return !/^>?\\s*powered by\\s+🌹.*🌹$/iu.test(compact);\n  });\n  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();\n  return kept.join('\\n') + '\\n\\n' + GLOBAL_FOOTER;\n}\n\nfunction decorateRelayMessage(message, style) {\n  if (!message || typeof message !== 'object') return message;\n  if (message.protocolMessage || message.reactionMessage) return message;\n  const out = { ...message };\n  if (typeof out.conversation === 'string') out.conversation = ensureGlobalFooter(sanitizeLegacyText(out.conversation, style));\n  if (out.extendedTextMessage?.text) out.extendedTextMessage = { ...out.extendedTextMessage, text: ensureGlobalFooter(sanitizeLegacyText(out.extendedTextMessage.text, style)) };\n  if (out.imageMessage?.caption) out.imageMessage = { ...out.imageMessage, caption: ensureGlobalFooter(sanitizeLegacyText(out.imageMessage.caption, style)) };\n  if (out.videoMessage?.caption) out.videoMessage = { ...out.videoMessage, caption: ensureGlobalFooter(sanitizeLegacyText(out.videoMessage.caption, style)) };\n  if (out.interactiveMessage?.body?.text) {\n    out.interactiveMessage = { ...out.interactiveMessage, body: { ...out.interactiveMessage.body, text: ensureGlobalFooter(out.interactiveMessage.body.text) } };\n  }\n  if (out.viewOnceMessage?.message) out.viewOnceMessage = { ...out.viewOnceMessage, message: decorateRelayMessage(out.viewOnceMessage.message, style) };\n  if (out.viewOnceMessageV2?.message) out.viewOnceMessageV2 = { ...out.viewOnceMessageV2, message: decorateRelayMessage(out.viewOnceMessageV2.message, style) };\n  if (out.ephemeralMessage?.message) out.ephemeralMessage = { ...out.ephemeralMessage, message: decorateRelayMessage(out.ephemeralMessage.message, style) };\n  return out;\n}\n\n`;
  rs = rs.replace(decorateAnchor, helpers + decorateAnchor);
  rs = rs.replace(
    `    if (cleaned !== next.text) { next.text = cleaned; changed = true; }`,
    `    cleaned = ensureGlobalFooter(cleaned);\n    if (cleaned !== next.text) { next.text = cleaned; changed = true; }`
  );
  rs = rs.replace(
    `    if (cleaned !== next.caption) { next.caption = cleaned; changed = true; }`,
    `    cleaned = ensureGlobalFooter(cleaned);\n    if (cleaned !== next.caption) { next.caption = cleaned; changed = true; }`
  );
  rs = rs.replace(
    `  decoratePayload,\n};`,
    `  decoratePayload,\n  ensureGlobalFooter,\n  decorateRelayMessage,\n  GLOBAL_FOOTER,\n};`
  );
}
// Migration forcée des installations déjà patchées avec l'ancienne forme sans espace.
rs = rs.split(LEGACY_FOOTER).join(FOOTER);
fs.writeFileSync(responseStylePath, rs, 'utf8');

let sm = fs.readFileSync(styleManagerPath, 'utf8');
if (!sm.includes(MARKER)) {
  const functionAnchor = `function getPhrases(overrideStyle) {`;
  if (!sm.includes(functionAnchor)) throw new Error('[global-footer] getPhrases introuvable');
  sm = sm.replace(functionAnchor, `const GLOBAL_FOOTER = '${FOOTER}'; // ${MARKER}\n\n${functionAnchor}`);
  const returnOld = `  return PERSONAS[s] || PERSONAS[0];`;
  const returnNew = `  const persona = PERSONAS[s] || PERSONAS[0];\n  return { ...persona, footer: () => GLOBAL_FOOTER };`;
  if (!sm.includes(returnOld)) throw new Error('[global-footer] retour getPhrases introuvable');
  sm = sm.replace(returnOld, returnNew);
}
sm = sm.split(LEGACY_FOOTER).join(FOOTER);
fs.writeFileSync(styleManagerPath, sm, 'utf8');

let menu = fs.readFileSync(menuPath, 'utf8');
menu = menu.split(LEGACY_FOOTER).join(FOOTER);
menu = menu.replace(/footer:\s*\(\)\s*=>\s*`[^`]*`,/g, `footer: () => \`${FOOTER}\`,`);
menu = menu.replace(/const SIGNATURE = [^;]+;/, `const SIGNATURE = '\\n${FOOTER}'; // ${MARKER}`);
fs.writeFileSync(menuPath, menu, 'utf8');

let handler = fs.readFileSync(handlerPath, 'utf8');
if (!handler.includes('[GLOBAL FOOTER RELAY]')) {
  const importOld = `const { decoratePayload } = require('./utils/responseStyle');`;
  const importNew = `const { decoratePayload, decorateRelayMessage } = require('./utils/responseStyle');`;
  if (handler.includes(importOld)) handler = handler.replace(importOld, importNew);
  else if (!handler.includes('decorateRelayMessage')) throw new Error('[global-footer] import responseStyle introuvable');

  const relayOld = `        const result = await _origRelay(jid, message, opts);`;
  const relayNew = `        const disciplinedRelay = decorateRelayMessage(message); // [GLOBAL FOOTER RELAY]\n        const result = await _origRelay(jid, disciplinedRelay, opts);`;
  if (!handler.includes(relayOld)) throw new Error('[global-footer] _origRelay introuvable');
  handler = handler.replace(relayOld, relayNew);
  fs.writeFileSync(handlerPath, handler, 'utf8');
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
let prestart = String(pkg.scripts?.prestart || '');
if (!prestart.includes('../global-footer-patch.js')) {
  pkg.scripts = pkg.scripts || {};
  const verifier = 'node scripts/verify-command-runtime.js';
  const special = 'node ../special-presentation-patch.js';
  if (prestart.includes(special)) {
    prestart = prestart.replace(special, `node ../global-footer-patch.js && ${special}`);
  } else if (prestart.includes(verifier)) {
    prestart = prestart.replace(verifier, `node ../global-footer-patch.js && ${verifier}`);
  } else {
    prestart = `${prestart}${prestart ? ' && ' : ''}node ../global-footer-patch.js`;
  }
  pkg.scripts.prestart = prestart;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

for (const file of [responseStylePath, styleManagerPath, menuPath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[global-footer] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
}

if (!fs.readFileSync(responseStylePath, 'utf8').includes(FOOTER)) throw new Error('[global-footer] footer absent responseStyle');
if (!fs.readFileSync(menuPath, 'utf8').includes(FOOTER)) throw new Error('[global-footer] footer absent menu');
if (!fs.readFileSync(handlerPath, 'utf8').includes('[GLOBAL FOOTER RELAY]')) throw new Error('[global-footer] relay non décoré');

console.log(`[global-footer] ✅ footer universel actif: ${FOOTER}`);
