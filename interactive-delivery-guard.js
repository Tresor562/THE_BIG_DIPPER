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
  return `async function sendStyledMenuMessage(sock, jid, options = {}) {
  // ${DIRECT_MARKER}
  // ${TIMEOUT_MARKER}
  const {
    text = '',
    style = 0,
    imageUrl = null,
    quoted = null,
    mentions = [],
    withImage = true,
    imageBuffer: providedImageBuffer = null,
  } = options;

  const channelUrl = config.social?.whatsappChannel || 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
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

  const waitForAck = (messageId, ms = 3200) => {
    if (!messageId || !sock?.ev || typeof sock.ev.on !== 'function') return Promise.resolve(true);
    return new Promise(resolve => {
      let settled = false;
      let timer = null;
      const detach = () => {
        if (typeof sock.ev.off === 'function') sock.ev.off('messages.update', onUpdate);
        else if (typeof sock.ev.removeListener === 'function') sock.ev.removeListener('messages.update', onUpdate);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        detach();
        resolve(value);
      };
      const onUpdate = updates => {
        for (const item of (updates || [])) {
          if (item?.key?.id !== messageId) continue;
          const status = Number(item?.update?.status);
          if (!Number.isFinite(status) || status >= 2) return finish(true);
        }
      };
      sock.ev.on('messages.update', onUpdate);
      timer = setTimeout(() => finish(false), ms);
      if (timer.unref) timer.unref();
    });
  };

  const contextInfo = {
    mentionedJid: mentions.filter(Boolean),
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',
      serverMessageId: -1,
    },
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

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
      header,
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: [{
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: '📢 Rejoindre la chaîne',
            url: channelUrl,
            merchant_url: channelUrl,
          }),
        }],
        messageParamsJson: '{}',
        messageVersion: 1,
      }),
      contextInfo,
    });

    // IMPORTANT : pas de viewOnceMessage. Le native-flow est relayé directement
    // avec les nœuds biz attendus par WhatsApp Web MD.
    const generated = generateWAMessageFromContent(
      jid,
      { interactiveMessage },
      { quoted: safeQuotedMessage, userJid: sock.user?.id }
    );

    const ackPromise = waitForAck(generated.key.id);
    await withTimeout(
      sock.relayMessage(jid, generated.message, {
        messageId: generated.key.id,
        additionalNodes: buildRelayNodes(),
      }),
      5000,
      'menu native-flow relay'
    );
    const acked = await ackPromise;
    if (!acked) throw new Error('menu native-flow sans ACK WhatsApp');
    return generated;
  } catch (interactiveErr) {
    console.warn('[Menu] native-flow non confirmé → fallback standard:', interactiveErr.message);
    const fallbackText = text + '\n\n📢 *Chaîne officielle :* ' + channelUrl;

    // Fallback 1 : message standard avec effet newsletter. Pour les longs
    // contenus (allmenu), on garde UNE seule bulle texte au lieu de séparer.
    try {
      if (imageBuffer && fallbackText.length <= 1000) {
        return await withTimeout(
          sock.sendMessage(jid, { image: imageBuffer, caption: fallbackText, contextInfo }, safeQuotedOptions),
          5000,
          'menu fallback newsletter image'
        );
      }
      return await withTimeout(
        sock.sendMessage(jid, { text: fallbackText, contextInfo }, safeQuotedOptions),
        5000,
        'menu fallback newsletter texte'
      );
    } catch (newsletterErr) {
      console.warn('[Menu] fallback newsletter indisponible → fallback brut:', newsletterErr.message);
      return withTimeout(
        sock.sendMessage(jid, { text: fallbackText }, safeQuotedOptions),
        5000,
        'menu fallback brut'
      );
    }
  }
}

`;
}

function directRepereSender() {
  return `async function sendInteractiveRepere(sock, jid, caption, imageBuffer, quoted) {
  // ${DIRECT_MARKER}
  // ${TIMEOUT_MARKER}
  const { channelUrl } = getChannelConfig();

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

  const waitForAck = (messageId, ms = 3200) => {
    if (!messageId || !sock?.ev || typeof sock.ev.on !== 'function') return Promise.resolve(true);
    return new Promise(resolve => {
      let settled = false;
      let timer = null;
      const detach = () => {
        if (typeof sock.ev.off === 'function') sock.ev.off('messages.update', onUpdate);
        else if (typeof sock.ev.removeListener === 'function') sock.ev.removeListener('messages.update', onUpdate);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        detach();
        resolve(value);
      };
      const onUpdate = updates => {
        for (const item of (updates || [])) {
          if (item?.key?.id !== messageId) continue;
          const status = Number(item?.update?.status);
          if (!Number.isFinite(status) || status >= 2) return finish(true);
        }
      };
      sock.ev.on('messages.update', onUpdate);
      timer = setTimeout(() => finish(false), ms);
      if (timer.unref) timer.unref();
    });
  };

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
      buttons: [{
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: '📢 Rejoindre la chaîne',
          url: channelUrl,
          merchant_url: channelUrl,
        }),
      }],
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

  const ackPromise = waitForAck(generated.key.id);
  await withTimeout(
    sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes,
    }),
    5000,
    'repere native-flow relay'
  );
  const acked = await ackPromise;
  if (!acked) throw new Error('repere native-flow sans ACK WhatsApp');
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

for (const marker of [DIRECT_MARKER, TIMEOUT_MARKER, ALLMENU_MARKER, 'additionalNodes: buildRelayNodes()', 'fullMenuText = chunks.join']) {
  if (!finalMenu.includes(marker)) throw new Error(`[delivery-guard] garde-fou menu absent: ${marker}`);
}
if (finalMenu.includes('viewOnceMessage: {')) {
  const senderStart = finalMenu.indexOf('async function sendStyledMenuMessage(');
  const senderEnd = finalMenu.indexOf('// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES', senderStart);
  const sender = finalMenu.slice(senderStart, senderEnd);
  if (sender.includes('viewOnceMessage: {')) throw new Error('[delivery-guard] menu utilise encore viewOnceMessage');
}
for (const marker of [DIRECT_MARKER, TIMEOUT_MARKER, 'additionalNodes,', 'sendStandardNewsletterFallback', 'sendHardFallback']) {
  if (!finalRepere.includes(marker)) throw new Error(`[delivery-guard] garde-fou repere absent: ${marker}`);
}
const repStart = finalRepere.indexOf('async function sendInteractiveRepere(');
const repEnd = finalRepere.indexOf('async function sendStandardNewsletterFallback(', repStart);
if (finalRepere.slice(repStart, repEnd).includes('viewOnceMessage: {')) {
  throw new Error('[delivery-guard] repere utilise encore viewOnceMessage');
}

console.log('[delivery-guard] ✅ native-flow direct + biz nodes + ACK; allmenu réunifié en un seul contenu');
