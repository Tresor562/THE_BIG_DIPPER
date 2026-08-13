'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const reperePath = path.join(BOT, 'commands', 'bot_sovereignty', 'repere.js');
const verifierPath = path.join(BOT, 'scripts', 'verify-command-runtime.js');

const OTAKU_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
const DEFAULT_MENU_IMAGE_URL = 'https://files.catbox.moe/1k8r1f.jpg';
const NEXUS_NEWSLETTER_MARKER = '[NEXUS NEWSLETTER ACTION]';
const OTAKU_CTA_MARKER = '[OTAKU CTA ACTION]';
const RELIABLE_IMAGE_MARKER = '[RELIABLE MENU IMAGE]';

for (const file of [menuPath, reperePath, verifierPath]) {
  if (!fs.existsSync(file)) throw new Error(`[interactive-render-fix] fichier absent: ${file}`);
}

function replaceRegion(source, startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  const end = start < 0 ? -1 : source.indexOf(endNeedle, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`[interactive-render-fix] ${label}: région introuvable`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

function directMenuSender() {
  return String.raw`async function sendStyledMenuMessage(sock, jid, options = {}) {
  // [DIRECT NATIVE FLOW DELIVERY]
  // [INTERACTIVE DELIVERY TIMEOUT]
  // [SINGLE COMMAND DELIVERY]
  // [DUAL CHANNEL CTA]
  // ${NEXUS_NEWSLETTER_MARKER}
  // ${OTAKU_CTA_MARKER}
  // ${RELIABLE_IMAGE_MARKER}
  const {
    text = '',
    style = 0,
    imageUrl = null,
    quoted = null,
    mentions = [],
    withImage = true,
    imageBuffer: providedImageBuffer = null,
  } = options;

  const newsletterJid = config.newsletterJid || '120363411005383995@newsletter';
  const otakuChannelUrl = '${OTAKU_CHANNEL_URL}';
  const defaultMenuImageUrl = '${DEFAULT_MENU_IMAGE_URL}';
  const safeQuotedMessage = quoted && jid.endsWith('@g.us') ? quoted : undefined;
  const safeQuotedOptions = safeQuotedMessage ? { quoted: safeQuotedMessage } : undefined;

  const withTimeout = async (promise, ms, label) => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(label + ' timeout après ' + ms + 'ms')), ms);
          if (timer.unref) timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const contextInfo = {
    mentionedJid: mentions.filter(Boolean),
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid,
      newsletterName: config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',
      serverMessageId: -1,
    },
  };

  const buildChannelButtons = () => ([
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '🖤 Voir Otaku Nexus',
        url: otakuChannelUrl,
        merchant_url: otakuChannelUrl,
      }),
    },
  ]);

  const loadReliableImage = async () => {
    if (!withImage) return null;
    const styleUrls = Array.isArray(STYLE_IMAGE_URLS?.[style])
      ? STYLE_IMAGE_URLS[style].filter(url => url && /^https?:\/\//i.test(url))
      : [];
    const shuffled = [...styleUrls].sort(() => Math.random() - 0.5).slice(0, 1);
    const candidates = [imageUrl, ...shuffled, defaultMenuImageUrl]
      .filter((url, index, list) => url && /^https?:\/\//i.test(url) && list.indexOf(url) === index);

    for (const candidate of candidates) {
      try {
        const buffer = await withTimeout(
          getImageBufferFromUrl(candidate),
          6500,
          'menu image ' + candidate
        );
        if (buffer) return buffer;
      } catch (err) {
        console.warn('[Menu] image candidate ignorée:', err.message);
      }
    }
    return null;
  };

  const sendSingleFallback = async imageBuffer => {
    // Un seul message de repli. Aucune URL brute n'est ajoutée au contenu.
    if (imageBuffer && text.length <= 1000) {
      return withTimeout(
        sock.sendMessage(jid, { image: imageBuffer, caption: text, contextInfo }, safeQuotedOptions),
        10000,
        'menu fallback unique image'
      );
    }
    return withTimeout(
      sock.sendMessage(jid, { text, contextInfo }, safeQuotedOptions),
      10000,
      'menu fallback unique texte'
    );
  };

  let imageBuffer = providedImageBuffer || null;
  if (withImage && !imageBuffer) {
    imageBuffer = await loadReliableImage();
    if (!imageBuffer) console.warn('[Menu] aucune image exploitable après les fallbacks');
  }

  const buildRelayNodes = () => {
    const bizNode = {
      tag: 'biz',
      attrs: {
        actual_actors: '2',
        host_storage: '2',
        privacy_mode_ts: String(Math.floor(Date.now() / 1000) - 77980457),
      },
      content: [
        {
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
        },
        { tag: 'quality_control', attrs: { source_type: 'third_party' } },
      ],
    };
    return jid.endsWith('@g.us')
      ? [bizNode]
      : [{ tag: 'bot', attrs: { biz_bot: '1' } }, bizNode];
  };

  let generated;
  try {
    let header = proto.Message.InteractiveMessage.Header.create({
      title: '', subtitle: '', hasMediaAttachment: false,
    });

    if (imageBuffer) {
      const prepared = await withTimeout(
        prepareWAMessageMedia({ image: imageBuffer }, { upload: sock.waUploadToServer }),
        12000,
        'menu media upload'
      );
      header = proto.Message.InteractiveMessage.Header.create({
        ...prepared,
        title: '', subtitle: '', hasMediaAttachment: true,
      });
    }

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
      header,
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: buildChannelButtons(),
        messageParamsJson: '{}',
        messageVersion: 1,
      }),
      contextInfo,
    });

    generated = generateWAMessageFromContent(
      jid,
      { interactiveMessage },
      { quoted: safeQuotedMessage, userJid: sock.user?.id }
    );
  } catch (prepareErr) {
    console.warn('[Menu] préparation interactive impossible → fallback unique:', prepareErr.message);
    return sendSingleFallback(imageBuffer);
  }

  try {
    await withTimeout(
      sock.relayMessage(jid, generated.message, {
        messageId: generated.key.id,
        additionalNodes: buildRelayNodes(),
      }),
      12000,
      'menu native-flow relay'
    );
    return generated;
  } catch (relayErr) {
    console.warn('[Menu] relay interactif rejeté → fallback unique:', relayErr.message);
    return sendSingleFallback(imageBuffer);
  }
}

`;
}

function directRepereSender() {
  return String.raw`async function sendInteractiveRepere(sock, jid, caption, imageBuffer, quoted) {
  // [DIRECT NATIVE FLOW DELIVERY]
  // [INTERACTIVE DELIVERY TIMEOUT]
  // [SINGLE COMMAND DELIVERY]
  // [DUAL CHANNEL CTA]
  // ${NEXUS_NEWSLETTER_MARKER}
  // ${OTAKU_CTA_MARKER}
  const otakuChannelUrl = '${OTAKU_CHANNEL_URL}';

  const withTimeout = async (promise, ms, label) => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(label + ' timeout après ' + ms + 'ms')), ms);
          if (timer.unref) timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let header = proto.Message.InteractiveMessage.Header.create({
    title: '', subtitle: '', hasMediaAttachment: false,
  });
  if (imageBuffer) {
    const prepared = await withTimeout(
      prepareWAMessageMedia({ image: imageBuffer }, { upload: sock.waUploadToServer }),
      12000,
      'repere media upload'
    );
    header = proto.Message.InteractiveMessage.Header.create({
      ...prepared,
      title: '', subtitle: '', hasMediaAttachment: true,
    });
  }

  const buttons = [{
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({
      display_text: '🖤 Voir Otaku Nexus',
      url: otakuChannelUrl,
      merchant_url: otakuChannelUrl,
    }),
  }];

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text: caption }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header,
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons,
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
    contextInfo: getContextInfo(),
  });

  const safeQuoted = quoted && jid.endsWith('@g.us') ? quoted : undefined;
  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    { quoted: safeQuoted, userJid: sock.user?.id }
  );

  const bizNode = {
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: String(Math.floor(Date.now() / 1000) - 77980457),
    },
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      },
      { tag: 'quality_control', attrs: { source_type: 'third_party' } },
    ],
  };
  const additionalNodes = jid.endsWith('@g.us')
    ? [bizNode]
    : [{ tag: 'bot', attrs: { biz_bot: '1' } }, bizNode];

  await withTimeout(
    sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes,
    }),
    12000,
    'repere native-flow relay'
  );
  return generated;
}

`;
}

let menu = fs.readFileSync(menuPath, 'utf8');
menu = replaceRegion(
  menu,
  'async function sendStyledMenuMessage(',
  '// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES',
  directMenuSender(),
  'sendStyledMenuMessage'
);
fs.writeFileSync(menuPath, menu);

let repere = fs.readFileSync(reperePath, 'utf8');
repere = replaceRegion(
  repere,
  'async function sendInteractiveRepere(',
  'async function sendStandardNewsletterFallback(',
  directRepereSender(),
  'sendInteractiveRepere'
);
fs.writeFileSync(reperePath, repere);

// Le vérificateur privé doit contrôler l'artefact réellement déployé :
// Nexus Tech = action newsletter native ; Otaku Nexus = CTA URL natif.
let verifier = fs.readFileSync(verifierPath, 'utf8');
verifier = verifier
  .replace(
    "  'additionalNodes: buildRelayNodes()', \"newsletterMetadata('jid', newsletterJid)\",\n  \"display_text: '📢 Voir Nexus Tech'\", \"display_text: '🖤 Voir Otaku Nexus'\",",
    "  'additionalNodes: buildRelayNodes()', '[NEXUS NEWSLETTER ACTION]', '[OTAKU CTA ACTION]',\n  '[RELIABLE MENU IMAGE]', \"display_text: '🖤 Voir Otaku Nexus'\"," 
  )
  .replace(
    "if ((menuSender.match(/display_text:\\s*['\"]📢 Voir Nexus Tech['\"]/g) || []).length !== 1) {\n  throw new Error('[verify-runtime] bouton Nexus Tech menu doit exister exactement une fois');\n}\n",
    "if (menuSender.includes(\"newsletterMetadata('jid'\")) {\n  throw new Error('[verify-runtime] menu dépend encore de newsletterMetadata avant affichage');\n}\n"
  )
  .replace(
    "  \"newsletterMetadata('jid', effectiveNewsletterJid)\", \"display_text: '📢 Voir Nexus Tech'\",\n  \"display_text: '🖤 Voir Otaku Nexus'\", 'sendStandardNewsletterFallback', 'sendHardFallback',",
    "  '[NEXUS NEWSLETTER ACTION]', '[OTAKU CTA ACTION]', \"display_text: '🖤 Voir Otaku Nexus'\",\n  'sendStandardNewsletterFallback', 'sendHardFallback',"
  )
  .replace(
    "if ((repereSender.match(/display_text:\\s*['\"]📢 Voir Nexus Tech['\"]/g) || []).length !== 1) {\n  throw new Error('[verify-runtime] bouton Nexus Tech repere doit exister exactement une fois');\n}\n",
    "if (repereSender.includes(\"newsletterMetadata('jid'\")) {\n  throw new Error('[verify-runtime] repere dépend encore de newsletterMetadata avant affichage');\n}\n"
  );
fs.writeFileSync(verifierPath, verifier);

for (const file of [menuPath, reperePath, verifierPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[interactive-render-fix] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalMenu = fs.readFileSync(menuPath, 'utf8');
const finalRepere = fs.readFileSync(reperePath, 'utf8');
const finalVerifier = fs.readFileSync(verifierPath, 'utf8');

for (const marker of [NEXUS_NEWSLETTER_MARKER, OTAKU_CTA_MARKER, RELIABLE_IMAGE_MARKER, "display_text: '🖤 Voir Otaku Nexus'", DEFAULT_MENU_IMAGE_URL]) {
  if (!finalMenu.includes(marker)) throw new Error(`[interactive-render-fix] menu incomplet: ${marker}`);
}
if (finalMenu.includes("newsletterMetadata('jid'")) {
  const senderStart = finalMenu.indexOf('async function sendStyledMenuMessage(');
  const senderEnd = finalMenu.indexOf('// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES', senderStart);
  if (finalMenu.slice(senderStart, senderEnd).includes("newsletterMetadata('jid'")) {
    throw new Error('[interactive-render-fix] menu dépend encore de newsletterMetadata');
  }
}
for (const marker of [NEXUS_NEWSLETTER_MARKER, OTAKU_CTA_MARKER, "display_text: '🖤 Voir Otaku Nexus'"]) {
  if (!finalRepere.includes(marker)) throw new Error(`[interactive-render-fix] repere incomplet: ${marker}`);
}
if (finalRepere.slice(finalRepere.indexOf('async function sendInteractiveRepere('), finalRepere.indexOf('async function sendStandardNewsletterFallback(')).includes("newsletterMetadata('jid'")) {
  throw new Error('[interactive-render-fix] repere dépend encore de newsletterMetadata');
}
if (!finalVerifier.includes('[RELIABLE MENU IMAGE]') || !finalVerifier.includes('[OTAKU CTA ACTION]')) {
  throw new Error('[interactive-render-fix] vérificateur runtime non aligné');
}

console.log('[interactive-render-fix] ✅ newsletter Nexus + CTA Otaku + image Menu/Allmenu robuste');
