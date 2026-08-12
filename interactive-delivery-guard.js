'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const reperePath = path.join(BOT, 'commands', 'bot_sovereignty', 'repere.js');
const MARKER = '[INTERACTIVE DELIVERY TIMEOUT]';
const ALLMENU_MARKER = '[ALLMENU STANDARD DELIVERY]';

for (const file of [menuPath, reperePath]) {
  if (!fs.existsSync(file)) throw new Error(`[delivery-guard] fichier absent: ${file}`);
}

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`[delivery-guard] ${label}: attendu 1 occurrence, trouvé ${count}`);
  return source.replace(search, replacement);
}

function replaceAllMenuBlock(source) {
  if (source.includes(ALLMENU_MARKER)) {
    console.log('[delivery-guard] allmenu standard déjà installé');
    return source;
  }

  const token = "if (body === 'allmenu') {";
  const startToken = source.indexOf(token);
  if (startToken === -1) throw new Error('[delivery-guard] branche allmenu introuvable');

  const start = source.lastIndexOf('\n', startToken) + 1;
  const stylePos = source.indexOf('const styleMatch = body.match(', startToken);
  if (stylePos === -1) throw new Error('[delivery-guard] fin de branche allmenu introuvable');
  const end = source.lastIndexOf('\n', stylePos) + 1;

  const indent = source.slice(start, startToken);
  const replacement = [
    `${indent}// ${ALLMENU_MARKER}`,
    `${indent}if (body === 'allmenu') {`,
    `${indent}  const ctx = buildMenuContext(rawSender, isSupreme, sock);`,
    `${indent}  const chunks = buildAllMenuChunks(`,
    `${indent}    ctx.styleActif,`,
    `${indent}    ctx.categoryNames,`,
    `${indent}    ctx.categories,`,
    `${indent}    prefix,`,
    `${indent}    ctx.count,`,
    `${indent}    { ...ctx, senderJid: rawSender }`,
    `${indent}  );`,
    `${indent}  for (let i = 0; i < chunks.length; i++) {`,
    `${indent}    await sock.sendMessage(`,
    `${indent}      extra.from,`,
    `${indent}      { text: chunks[i], mentions: [rawSender] },`,
    `${indent}      (i === 0 && extra.from.endsWith('@g.us')) ? { quoted: msg } : undefined`,
    `${indent}    );`,
    `${indent}  }`,
    `${indent}  return;`,
    `${indent}}`,
    '',
  ].join('\n');

  console.log('[delivery-guard] allmenu remplacé structurellement par sendMessage standard');
  return source.slice(0, start) + replacement + source.slice(end);
}

const helper = `// ${MARKER}\nasync function withInteractiveTimeout(promise, ms, label) {\n  let timer;\n  try {\n    return await Promise.race([\n      Promise.resolve(promise),\n      new Promise((_, reject) => {\n        timer = setTimeout(() => reject(new Error(label + ' timeout après ' + ms + 'ms')), ms);\n        if (timer.unref) timer.unref();\n      }),\n    ]);\n  } finally {\n    if (timer) clearTimeout(timer);\n  }\n}\n\n`;

// ─────────────────────────────────────────────────────────────
// MENU / ALLMENU
// ─────────────────────────────────────────────────────────────
let menu = fs.readFileSync(menuPath, 'utf8');
if (!menu.includes(MARKER)) {
  menu = replaceOnce(
    menu,
    'async function sendStyledMenuMessage(sock, jid, options = {}) {',
    helper + 'async function sendStyledMenuMessage(sock, jid, options = {}) {',
    'helper timeout menu'
  );

  const oldImage = `  let imageBuffer = null;\n  if (withImage) {\n    imageBuffer = imageUrl ? await getImageBufferFromUrl(imageUrl) : null;\n    if (!imageBuffer) imageBuffer = await getImageBufferForStyle(style);\n  }`;
  const newImage = `  let imageBuffer = null;\n  if (withImage) {\n    try {\n      imageBuffer = await withInteractiveTimeout((async () => {\n        const custom = imageUrl ? await getImageBufferFromUrl(imageUrl) : null;\n        return custom || await getImageBufferForStyle(style);\n      })(), 3500, 'menu image');\n    } catch (imageErr) {\n      console.warn('[Menu] image trop lente/indisponible → envoi sans image:', imageErr.message);\n      imageBuffer = null;\n    }\n  }`;
  menu = replaceOnce(menu, oldImage, newImage, 'timeout image menu');

  const oldPrepare = `      const prepared = await prepareWAMessageMedia(\n        { image: imageBuffer },\n        { upload: sock.waUploadToServer }\n      );`;
  const newPrepare = `      const prepared = await withInteractiveTimeout(\n        prepareWAMessageMedia(\n          { image: imageBuffer },\n          { upload: sock.waUploadToServer }\n        ),\n        4500,\n        'menu media upload'\n      );`;
  menu = replaceOnce(menu, oldPrepare, newPrepare, 'timeout upload menu');

  menu = replaceOnce(
    menu,
    '    await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });',
    "    await withInteractiveTimeout(\n      sock.relayMessage(jid, generated.message, { messageId: generated.key.id }),\n      5000,\n      'menu interactive relay'\n    );",
    'timeout relay menu'
  );
} else {
  console.log('[delivery-guard] menu interactif déjà protégé');
}

// ALLMENU est volontairement standard : on remplace le bloc par sa logique,
// pas par sa mise en forme. prepare.js et menu-visual-patch.js peuvent changer
// les espaces ou le contenu interne sans casser ce garde-fou.
menu = replaceAllMenuBlock(menu);
fs.writeFileSync(menuPath, menu);
console.log('[delivery-guard] ✅ menu/allmenu protégés contre les blocages interactifs');

// ─────────────────────────────────────────────────────────────
// REPERE / REPÈRE
// ─────────────────────────────────────────────────────────────
let repere = fs.readFileSync(reperePath, 'utf8');
if (!repere.includes(MARKER)) {
  repere = replaceOnce(
    repere,
    'async function fetchImage() {',
    helper + 'async function fetchImage() {',
    'helper timeout repere'
  );

  const oldPrepare = `    const prepared = await prepareWAMessageMedia(\n      { image: imageBuffer },\n      { upload: sock.waUploadToServer }\n    );`;
  const newPrepare = `    const prepared = await withInteractiveTimeout(\n      prepareWAMessageMedia(\n        { image: imageBuffer },\n        { upload: sock.waUploadToServer }\n      ),\n      4500,\n      'repere media upload'\n    );`;
  repere = replaceOnce(repere, oldPrepare, newPrepare, 'timeout upload repere');

  repere = replaceOnce(
    repere,
    '  await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });',
    "  await withInteractiveTimeout(\n    sock.relayMessage(jid, generated.message, { messageId: generated.key.id }),\n    5000,\n    'repere interactive relay'\n  );",
    'timeout relay repere'
  );

  repere = replaceOnce(
    repere,
    '    const imageBuffer = await fetchImage();',
    `    let imageBuffer = null;\n    try {\n      imageBuffer = await withInteractiveTimeout(fetchImage(), 3500, 'repere image');\n    } catch (imageErr) {\n      console.warn('[repere] image trop lente/indisponible → envoi sans image:', imageErr.message);\n    }`,
    'timeout image repere'
  );

  fs.writeFileSync(reperePath, repere);
  console.log('[delivery-guard] ✅ repere/repère protégés contre les blocages interactifs');
} else {
  console.log('[delivery-guard] repere déjà protégé');
}

for (const file of [menuPath, reperePath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[delivery-guard] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalMenu = fs.readFileSync(menuPath, 'utf8');
const finalRepere = fs.readFileSync(reperePath, 'utf8');

for (const marker of [
  MARKER,
  ALLMENU_MARKER,
  "3500, 'menu image'",
  "4500,\n        'menu media upload'",
  "'menu interactive relay'",
]) {
  if (!finalMenu.includes(marker)) throw new Error(`[delivery-guard] garde-fou menu absent: ${marker}`);
}

const allmenuStart = finalMenu.indexOf(`// ${ALLMENU_MARKER}`);
const allmenuEnd = allmenuStart === -1 ? -1 : finalMenu.indexOf('const styleMatch = body.match(', allmenuStart);
const allmenuBlock = allmenuStart >= 0 && allmenuEnd > allmenuStart ? finalMenu.slice(allmenuStart, allmenuEnd) : '';
if (!allmenuBlock.includes('await sock.sendMessage(')) {
  throw new Error('[delivery-guard] allmenu ne possède pas son envoi standard');
}
if (allmenuBlock.includes('sendStyledMenuMessage(') || allmenuBlock.includes('relayMessage(')) {
  throw new Error('[delivery-guard] allmenu dépend encore de la livraison interactive');
}

for (const marker of [
  MARKER,
  "3500, 'repere image'",
  "'repere media upload'",
  "'repere interactive relay'",
  'fallbackText',
  'await sock.sendMessage(',
]) {
  if (!finalRepere.includes(marker)) throw new Error(`[delivery-guard] garde-fou repere absent: ${marker}`);
}

console.log('[delivery-guard] ✅ livraison bornée: menu/repere interactifs avec fallback; allmenu standard idempotent');
