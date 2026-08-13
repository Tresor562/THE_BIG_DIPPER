'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const reperePath = path.join(BOT, 'commands', 'bot_sovereignty', 'repere.js');
const DIRECT_MARKER = '[DIRECT NATIVE FLOW DELIVERY]';
const TIMEOUT_MARKER = '[INTERACTIVE DELIVERY TIMEOUT]';
const ALLMENU_MARKER = '[ALLMENU SINGLE RICH DELIVERY]';
const DUAL_CTA_MARKER = '[DUAL CHANNEL CTA]';
const SINGLE_DELIVERY_MARKER = '[SINGLE COMMAND DELIVERY]';
const OTAKU_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';

for (const file of [menuPath, reperePath]) {
  if (!fs.existsSync(file)) throw new Error(`[delivery-guard] fichier absent: ${file}`);
}

function replaceRegion(source, startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  const end = start < 0 ? -1 : source.indexOf(endNeedle, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`[delivery-guard] ${label}: région introuvable`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

function directMenuSender() {
  return String.raw`async function sendStyledMenuMessage(sock, jid, options = {}) {
  // ${DIRECT_MARKER}
  // ${TIMEOUT_MARKER}
  // ${DUAL_CTA_MARKER}
  // ${SINGLE_DELIVERY_MARKER}
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

  const resolveNexusChannelUrl = async () => {
    if (sock?._dipperNexusChannelUrl) return sock._dipperNexusChannelUrl;
    if (typeof sock?.newsletterMetadata !== 'function') {
      throw new Error('newsletterMetadata indisponible pour Nexus Tech');
    }
    const metadata = await withTimeout(
      sock.newsletterMetadata('jid', newsletterJid),
      5000,
      'Nexus Tech newsletter metadata'
    );
    const invite = String(metadata?.invite || '')
      .replace(/^https:\/\/whatsapp\.com\/channel\//i, '')
      .trim();
    if (!invite) throw new Error('invite public Nexus Tech absent');
    const url = 'https://whatsapp.com/channel/' + invite;
    sock._dipperNexusChannelUrl = url;
    return url;
  };

  const buildChannelButtons = async () => {
    const nexusChannelUrl = await resolveNexusChannelUrl();
    return [
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
    ];
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

  const sendSingleFallback = async imageBuffer => {
    // Un seul fallback, uniquement si l'interactif échoue AVANT d'être relayé
    // ou si relayMessage rejette réellement. Aucun lien brut n'est ajouté.
    if (imageBuffer && text.length <= 1000) {
      return withTimeout(
        sock.sendMessage(jid, { image: imageBuffer, caption: text, contextInfo }, safeQuotedOptions),
        7000,
        'menu fallback unique image'
      );
    }
    return withTimeout(
      sock.sendMessage(jid, { text, contextInfo }, safeQuotedOptions),
      7000,
      'menu fallback unique texte'
    );
  };

  let imageBuffer = providedImageBuffer || null;
  if (withImage && !imageBuffer) {
    try {
      imageBuffer = await withTimeout((async () => {
        const custom = imageUrl ? await getImageBufferFromUrl(imageUrl) : null;
        return custom || await getImageBufferForStyle(style);
      })(), 3500, 'menu image');
    } catch (imageErr) {
      console.warn('[Menu] image indisponible:', imageErr.message);
      imageBuffer = null;
    }
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
        4500,
        'menu media upload'
      );
      header = proto.Message.InteractiveMessage.Header.create({
        ...prepared,
        title: '', subtitle: '', hasMediaAttachment: true,
      });
    }

    const buttons = await buildChannelButtons();
    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
      header,
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons,
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
      10000,
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
  // ${DIRECT_MARKER}
  // ${TIMEOUT_MARKER}
  // ${DUAL_CTA_MARKER}
  // ${SINGLE_DELIVERY_MARKER}
  const { newsletterJid } = getChannelConfig();
  const effectiveNewsletterJid = newsletterJid || config.newsletterJid || '120363411005383995@newsletter';
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

  const resolveNexusChannelUrl = async () => {
    if (sock?._dipperNexusChannelUrl) return sock._dipperNexusChannelUrl;
    if (typeof sock?.newsletterMetadata !== 'function') {
      throw new Error('newsletterMetadata indisponible pour Nexus Tech');
    }
    const metadata = await withTimeout(
      sock.newsletterMetadata('jid', effectiveNewsletterJid),
      5000,
      'Nexus Tech newsletter metadata'
    );
    const invite = String(metadata?.invite || '')
      .replace(/^https:\/\/whatsapp\.com\/channel\//i, '')
      .trim();
    if (!invite) throw new Error('invite public Nexus Tech absent');
    const url = 'https://whatsapp.com/channel/' + invite;
    sock._dipperNexusChannelUrl = url;
    return url;
  };

  const nexusChannelUrl = await resolveNexusChannelUrl();
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
  ];

  let header = proto.Message.InteractiveMessage.Header.create({
    title: '', subtitle: '', hasMediaAttachment: false,
  });
  if (imageBuffer) {
    const prepared = await withTimeout(
      prepareWAMessageMedia({ image: imageBuffer }, { upload: sock.waUploadToServer }),
      4500,
      'repere media upload'
    );
    header = proto.Message.InteractiveMessage.Header.create({
      ...prepared,
      title: '', subtitle: '', hasMediaAttachment: true,
    });
  }

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
    10000,
    'repere native-flow relay'
  );
  return generated;
}

`;
}

function replaceAllMenuBlock(source) {
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
    `${indent}    ctx.styleActif, ctx.categoryNames, ctx.categories, prefix, ctx.count,`,
    `${indent}    { ...ctx, senderJid: rawSender }`,
    `${indent}  );`,
    `${indent}  const fullMenuText = chunks.join('\\n\\n');`,
    `${indent}  await sendStyledMenuMessage(sock, extra.from, {`,
    `${indent}    text: fullMenuText,`,
    `${indent}    style: ctx.styleActif,`,
    `${indent}    imageUrl: ctx.imageUrl || null,`,
    `${indent}    quoted: extra.from.endsWith('@g.us') ? msg : null,`,
    `${indent}    mentions: [rawSender],`,
    `${indent}    withImage: true,`,
    `${indent}  });`,
    `${indent}  return;`,
    `${indent}}`,
    '',
  ].join('\n');

  return source.slice(0, start) + replacement + source.slice(end);
}

let menu = fs.readFileSync(menuPath, 'utf8');
menu = replaceRegion(
  menu,
  'async function sendStyledMenuMessage(',
  '// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES',
  directMenuSender(),
  'sendStyledMenuMessage'
);
menu = replaceAllMenuBlock(menu);
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

for (const file of [menuPath, reperePath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[delivery-guard] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalMenu = fs.readFileSync(menuPath, 'utf8');
const finalRepere = fs.readFileSync(reperePath, 'utf8');

for (const marker of [
  DIRECT_MARKER,
  TIMEOUT_MARKER,
  ALLMENU_MARKER,
  DUAL_CTA_MARKER,
  SINGLE_DELIVERY_MARKER,
  'additionalNodes: buildRelayNodes()',
  'fullMenuText = chunks.join',
  "newsletterMetadata('jid', newsletterJid)",
  "display_text: '📢 Voir Nexus Tech'",
  "display_text: '🖤 Voir Otaku Nexus'",
]) {
  if (!finalMenu.includes(marker)) throw new Error(`[delivery-guard] garde-fou menu absent: ${marker}`);
}
if (finalMenu.includes('waitForAck(') || finalMenu.includes('sans ACK WhatsApp')) {
  throw new Error('[delivery-guard] ancien fallback ACK susceptible de doubler menu/allmenu encore présent');
}
if (finalMenu.includes('viewOnceMessage: {')) {
  const senderStart = finalMenu.indexOf('async function sendStyledMenuMessage(');
  const senderEnd = finalMenu.indexOf('// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES', senderStart);
  const sender = finalMenu.slice(senderStart, senderEnd);
  if (sender.includes('viewOnceMessage: {')) throw new Error('[delivery-guard] menu utilise encore viewOnceMessage');
}

for (const marker of [
  DIRECT_MARKER,
  TIMEOUT_MARKER,
  DUAL_CTA_MARKER,
  SINGLE_DELIVERY_MARKER,
  'additionalNodes,',
  'sendStandardNewsletterFallback',
  'sendHardFallback',
  "newsletterMetadata('jid', effectiveNewsletterJid)",
  "display_text: '📢 Voir Nexus Tech'",
  "display_text: '🖤 Voir Otaku Nexus'",
]) {
  if (!finalRepere.includes(marker)) throw new Error(`[delivery-guard] garde-fou repere absent: ${marker}`);
}
if (finalRepere.includes('waitForAck(') || finalRepere.includes('sans ACK WhatsApp')) {
  throw new Error('[delivery-guard] ancien fallback ACK susceptible de doubler repere encore présent');
}
const repStart = finalRepere.indexOf('async function sendInteractiveRepere(');
const repEnd = finalRepere.indexOf('async function sendStandardNewsletterFallback(', repStart);
if (finalRepere.slice(repStart, repEnd).includes('viewOnceMessage: {')) {
  throw new Error('[delivery-guard] repere utilise encore viewOnceMessage');
}

console.log('[delivery-guard] ✅ un seul envoi + effet newsletter Nexus Tech + 2 CTA (Nexus Tech / Otaku Nexus)');
