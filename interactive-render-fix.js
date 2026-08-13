'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const reperePath = path.join(BOT, 'commands', 'bot_sovereignty', 'repere.js');
const verifierPath = path.join(BOT, 'scripts', 'verify-command-runtime.js');

const NEXUS_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';
const OTAKU_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
const SUPPORT_GROUP_URL = 'https://chat.whatsapp.com/Dm7yX11U7vmCCFM240sNKq?s=cl&p=a&ilr=1';
const DEFAULT_MENU_IMAGE_URL = 'https://files.catbox.moe/1k8r1f.jpg';

const NEXUS_NEWSLETTER_MARKER = '[NEXUS NEWSLETTER ACTION]';
const NEXUS_CTA_MARKER = '[NEXUS CTA ACTION]';
const OTAKU_CTA_MARKER = '[OTAKU CTA ACTION]';
const SUPPORT_CTA_MARKER = '[SUPPORT CTA ACTION]';
const RELIABLE_IMAGE_MARKER = '[RELIABLE MENU IMAGE]';
const THREE_CTA_MARKER = '[THREE DESTINATION CTA]';

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
  // ${THREE_CTA_MARKER}
  // ${NEXUS_NEWSLETTER_MARKER}
  // ${NEXUS_CTA_MARKER}
  // ${OTAKU_CTA_MARKER}
  // ${SUPPORT_CTA_MARKER}
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
  const nexusChannelUrl = '${NEXUS_CHANNEL_URL}';
  const otakuChannelUrl = '${OTAKU_CHANNEL_URL}';
  const supportGroupUrl = '${SUPPORT_GROUP_URL}';
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
        display_text: '📢 Voir Nexus Tech',
        url: nexusChannelUrl,
        merchant_url: nexusChannelUrl,
      }),
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '🖤 Voir Otaku Nexus',
        url: otakuChannelUrl,
        merchant_url: otakuChannelUrl,
      }),
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '🛠️ Groupe Support',
        url: supportGroupUrl,
        merchant_url: supportGroupUrl,
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
    // Une seule réponse de secours; aucun lien brut n'est ajouté au texte.
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
  // ${THREE_CTA_MARKER}
  // ${NEXUS_NEWSLETTER_MARKER}
  // ${NEXUS_CTA_MARKER}
  // ${OTAKU_CTA_MARKER}
  // ${SUPPORT_CTA_MARKER}
  const nexusChannelUrl = '${NEXUS_CHANNEL_URL}';
  const otakuChannelUrl = '${OTAKU_CHANNEL_URL}';
  const supportGroupUrl = '${SUPPORT_GROUP_URL}';

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

  const buttons = [
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '📢 Voir Nexus Tech',
        url: nexusChannelUrl,
        merchant_url: nexusChannelUrl,
      }),
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '🖤 Voir Otaku Nexus',
        url: otakuChannelUrl,
        merchant_url: otakuChannelUrl,
      }),
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '🛠️ Groupe Support',
        url: supportGroupUrl,
        merchant_url: supportGroupUrl,
      }),
    },
  ];

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

// Aligne le vérificateur privé sur l'artefact réellement déployé.
let verifier = fs.readFileSync(verifierPath, 'utf8');
verifier = verifier
  .replace(/\s*"newsletterMetadata\('jid', newsletterJid\)",/g, '')
  .replace(/\s*"newsletterMetadata\('jid', effectiveNewsletterJid\)",/g, '');

const menuOtakuGuard = `if ((menuSender.match(/display_text:\\s*['\"]🖤 Voir Otaku Nexus['\"]/g) || []).length !== 1) {\n  throw new Error('[verify-runtime] bouton Otaku Nexus menu doit exister exactement une fois');\n}`;
if (!verifier.includes("display_text: '🛠️ Groupe Support'")) {
  verifier = verifier.replace(
    menuOtakuGuard,
    menuOtakuGuard + `\nif ((menuSender.match(/display_text:\\s*['\"]🛠️ Groupe Support['\"]/g) || []).length !== 1) {\n  throw new Error('[verify-runtime] bouton Groupe Support menu doit exister exactement une fois');\n}\nif (menuSender.includes("newsletterMetadata('jid'")) {\n  throw new Error('[verify-runtime] menu dépend encore de newsletterMetadata avant affichage');\n}`
  );
}

const repereOtakuGuard = `if ((repereSender.match(/display_text:\\s*['\"]🖤 Voir Otaku Nexus['\"]/g) || []).length !== 1) {\n  throw new Error('[verify-runtime] bouton Otaku Nexus repere doit exister exactement une fois');\n}`;
if (!verifier.includes('bouton Groupe Support repere doit exister exactement une fois')) {
  verifier = verifier.replace(
    repereOtakuGuard,
    repereOtakuGuard + `\nif ((repereSender.match(/display_text:\\s*['\"]🛠️ Groupe Support['\"]/g) || []).length !== 1) {\n  throw new Error('[verify-runtime] bouton Groupe Support repere doit exister exactement une fois');\n}\nif (repereSender.includes("newsletterMetadata('jid'")) {\n  throw new Error('[verify-runtime] repere dépend encore de newsletterMetadata avant affichage');\n}`
  );
}

// Les trois libellés doivent aussi être exigés dans les marqueurs globaux.
verifier = verifier.replace(
  "\"display_text: '📢 Voir Nexus Tech'\", \"display_text: '🖤 Voir Otaku Nexus'\",",
  "\"display_text: '📢 Voir Nexus Tech'\", \"display_text: '🖤 Voir Otaku Nexus'\", \"display_text: '🛠️ Groupe Support'\"," 
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

const requiredButtons = [
  "display_text: '📢 Voir Nexus Tech'",
  "display_text: '🖤 Voir Otaku Nexus'",
  "display_text: '🛠️ Groupe Support'",
];
for (const marker of [NEXUS_NEWSLETTER_MARKER, NEXUS_CTA_MARKER, OTAKU_CTA_MARKER, SUPPORT_CTA_MARKER, THREE_CTA_MARKER, RELIABLE_IMAGE_MARKER, DEFAULT_MENU_IMAGE_URL, ...requiredButtons]) {
  if (!finalMenu.includes(marker)) throw new Error(`[interactive-render-fix] menu incomplet: ${marker}`);
}
for (const marker of [NEXUS_NEWSLETTER_MARKER, NEXUS_CTA_MARKER, OTAKU_CTA_MARKER, SUPPORT_CTA_MARKER, THREE_CTA_MARKER, ...requiredButtons]) {
  if (!finalRepere.includes(marker)) throw new Error(`[interactive-render-fix] repere incomplet: ${marker}`);
}

const menuStart = finalMenu.indexOf('async function sendStyledMenuMessage(');
const menuEnd = finalMenu.indexOf('// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES', menuStart);
const menuSender = finalMenu.slice(menuStart, menuEnd);
const repStart = finalRepere.indexOf('async function sendInteractiveRepere(');
const repEnd = finalRepere.indexOf('async function sendStandardNewsletterFallback(', repStart);
const repereSender = finalRepere.slice(repStart, repEnd);

for (const [label, source] of [['menu', menuSender], ['repere', repereSender]]) {
  if (source.includes("newsletterMetadata('jid'")) {
    throw new Error(`[interactive-render-fix] ${label} dépend encore de newsletterMetadata`);
  }
  for (const button of requiredButtons) {
    if ((source.match(new RegExp(button.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) {
      throw new Error(`[interactive-render-fix] ${label}: ${button} doit exister exactement une fois`);
    }
  }
}

if (!finalVerifier.includes("display_text: '🛠️ Groupe Support'") || !finalVerifier.includes('bouton Groupe Support menu doit exister exactement une fois')) {
  throw new Error('[interactive-render-fix] vérificateur runtime non aligné sur les trois CTA');
}

console.log('[interactive-render-fix] ✅ effet newsletter Nexus Tech + 3 CTA URL + image Menu/Allmenu robuste');
