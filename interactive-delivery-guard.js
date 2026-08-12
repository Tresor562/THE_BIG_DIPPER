'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const reperePath = path.join(BOT, 'commands', 'bot_sovereignty', 'repere.js');
const MARKER = '[INTERACTIVE DELIVERY TIMEOUT]';

for (const file of [menuPath, reperePath]) {
  if (!fs.existsSync(file)) throw new Error(`[delivery-guard] fichier absent: ${file}`);
}

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`[delivery-guard] ${label}: attendu 1 occurrence, trouvé ${count}`);
  return source.replace(search, replacement);
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

  // ALLMENU est potentiellement volumineux et segmenté. Il doit utiliser la
  // primitive la plus fiable et ne jamais attendre un CTA interactif pour
  // chaque segment. Le menu principal conserve l'interactif + fallback.
  const allMenuOld = `    for (let i = 0; i < chunks.length; i++) {\n      await sendStyledMenuMessage(sock, extra.from, {\n        text: chunks[i],\n        style: ctx.styleActif,\n        imageUrl: ctx.imageUrl || null,\n        quoted: i === 0 ? msg : null,\n        mentions: [rawSender],\n        withImage: i === 0,\n      });\n    }`;
  const allMenuNew = `    for (let i = 0; i < chunks.length; i++) {\n      await sock.sendMessage(\n        extra.from,\n        { text: chunks[i], mentions: [rawSender] },\n        (i === 0 && extra.from.endsWith('@g.us')) ? { quoted: msg } : undefined\n      );\n    }`;
  menu = replaceOnce(menu, allMenuOld, allMenuNew, 'allmenu envoi standard fiable');

  fs.writeFileSync(menuPath, menu);
  console.log('[delivery-guard] ✅ menu/allmenu protégés contre les blocages interactifs');
} else {
  console.log('[delivery-guard] menu déjà protégé');
}

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
  "3500, 'menu image'",
  "4500,\n        'menu media upload'",
  "'menu interactive relay'",
  'await sock.sendMessage(\n        extra.from,\n        { text: chunks[i]',
]) {
  if (!finalMenu.includes(marker)) throw new Error(`[delivery-guard] garde-fou menu absent: ${marker}`);
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

console.log('[delivery-guard] ✅ livraison bornée: image ≤3.5s, média ≤4.5s, interactif ≤5s, fallback obligatoire');
