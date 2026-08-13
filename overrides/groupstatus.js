'use strict';

const {
  proto,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');

const STATUS_SOURCE = Object.freeze({
  IMAGE: 0,
  VIDEO: 1,
  GIF: 2,
  AUDIO: 3,
  TEXT: 4,
});

const GROUP_STATUS_FIELD_NUMBER = 66;
const GROUP_STATUS_WIRE_TAG = GROUP_STATUS_FIELD_NUMBER << 3;

function installGroupStatusProtoCompat() {
  const ContextInfo = proto?.ContextInfo;
  if (!ContextInfo?.encode || !ContextInfo?.fromObject) {
    throw new Error('ContextInfo protobuf indisponible dans cette version de Baileys.');
  }

  if (ContextInfo.__dipperGroupStatusCompat) return;

  const originalEncode = ContextInfo.encode.bind(ContextInfo);
  const originalFromObject = ContextInfo.fromObject.bind(ContextInfo);

  ContextInfo.fromObject = function fromObjectWithGroupStatus(object) {
    const converted = originalFromObject(object);
    if (object && Object.prototype.hasOwnProperty.call(object, 'isGroupStatus')) {
      converted.isGroupStatus = Boolean(object.isGroupStatus);
    }
    return converted;
  };

  ContextInfo.encode = function encodeWithGroupStatus(message, writer) {
    const out = originalEncode(message, writer);
    if (message && message.isGroupStatus != null) {
      out.uint32(GROUP_STATUS_WIRE_TAG).bool(Boolean(message.isGroupStatus));
    }
    return out;
  };

  Object.defineProperty(ContextInfo, '__dipperGroupStatusCompat', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

installGroupStatusProtoCompat();

function unwrapMessage(message) {
  let current = message || {};
  for (let i = 0; i < 8; i += 1) {
    const next =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      null;
    if (!next) break;
    current = next;
  }
  return current || {};
}

function findContextInfo(message) {
  const root = unwrapMessage(message);
  const nodes = [
    root.extendedTextMessage,
    root.imageMessage,
    root.videoMessage,
    root.audioMessage,
    root.stickerMessage,
    root.documentMessage,
    root.buttonsResponseMessage,
    root.listResponseMessage,
  ].filter(Boolean);
  return nodes.map((node) => node?.contextInfo).find(Boolean) || null;
}

function findQuotedMessage(message) {
  const contextInfo = findContextInfo(message);
  return contextInfo?.quotedMessage ? unwrapMessage(contextInfo.quotedMessage) : null;
}

function extractText(message) {
  const root = unwrapMessage(message);
  return String(
    root.conversation ||
    root.extendedTextMessage?.text ||
    root.imageMessage?.caption ||
    root.videoMessage?.caption ||
    ''
  ).trim();
}

async function downloadToBuffer(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error('Le média est vide ou a expiré.');
  return buffer;
}

function statusContext(statusSourceType) {
  return { isGroupStatus: true, statusSourceType };
}

async function buildStatusPayload(sourceMessage, overrideCaption = '') {
  const source = unwrapMessage(sourceMessage);
  const caption = String(overrideCaption || '').trim();

  if (source.imageMessage) {
    return {
      type: 'image',
      content: {
        image: await downloadToBuffer(source.imageMessage, 'image'),
        caption: caption || source.imageMessage.caption || '',
        contextInfo: statusContext(STATUS_SOURCE.IMAGE),
      },
    };
  }

  if (source.videoMessage) {
    const isGif = Boolean(source.videoMessage.gifPlayback);
    return {
      type: isGif ? 'gif' : 'video',
      content: {
        video: await downloadToBuffer(source.videoMessage, 'video'),
        caption: caption || source.videoMessage.caption || '',
        gifPlayback: isGif,
        contextInfo: statusContext(isGif ? STATUS_SOURCE.GIF : STATUS_SOURCE.VIDEO),
      },
    };
  }

  if (source.audioMessage) {
    return {
      type: 'audio',
      content: {
        audio: await downloadToBuffer(source.audioMessage, 'audio'),
        mimetype: source.audioMessage.mimetype || 'audio/mpeg',
        ptt: Boolean(source.audioMessage.ptt),
        contextInfo: statusContext(STATUS_SOURCE.AUDIO),
      },
    };
  }

  if (source.stickerMessage) {
    const sticker = await downloadToBuffer(source.stickerMessage, 'sticker');
    let image = sticker;
    try {
      image = await require('sharp')(sticker).png().toBuffer();
    } catch (error) {
      throw new Error(`Impossible de convertir ce sticker en image: ${error.message}`);
    }
    return {
      type: 'image',
      content: {
        image,
        caption,
        contextInfo: statusContext(STATUS_SOURCE.IMAGE),
      },
    };
  }

  const text = caption || extractText(source);
  if (text) {
    return {
      type: 'texte',
      content: {
        text,
        contextInfo: statusContext(STATUS_SOURCE.TEXT),
      },
    };
  }

  return null;
}

async function postRealGroupStatus(sock, groupJid, sourceMessage, overrideCaption = '') {
  if (!groupJid?.endsWith('@g.us')) throw new Error('Le destinataire n’est pas un groupe WhatsApp valide.');

  const payload = await buildStatusPayload(sourceMessage, overrideCaption);
  if (!payload) throw new Error('Aucun texte, image, vidéo, GIF, audio ou sticker compatible trouvé.');

  const result = await sock.sendMessage(groupJid, payload.content);
  if (!result?.key?.id) throw new Error('WhatsApp n’a pas confirmé la création du message de statut.');

  console.log('[gstatus] group status envoyé', {
    groupJid,
    type: payload.type,
    messageId: result.key.id,
  });

  return { ...payload, result };
}

module.exports = {
  name: 'gstatus',
  aliases: ['groupstatus', 'gs', 'gcstatus', 'groupestatuts', 'togstatus', 'swgc'],
  description: 'Publie réellement un texte ou un média dans le statut du groupe WhatsApp.',
  usage: '.gstatus <texte> | répondre à un média avec .gstatus [légende]',
  category: '⚙️ Gestion de groupe',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const groupJid = extra?.from || msg?.key?.remoteJid;
    if (!groupJid?.endsWith('@g.us')) {
      return extra.reply('👥 Cette commande fonctionne uniquement dans un groupe WhatsApp.');
    }

    const suppliedText = Array.isArray(args) ? args.join(' ').trim() : '';
    const quoted = findQuotedMessage(msg?.message);
    const ownMessage = unwrapMessage(msg?.message);
    let source = quoted;

    if (!source) {
      const ownHasMedia = Boolean(
        ownMessage.imageMessage ||
        ownMessage.videoMessage ||
        ownMessage.audioMessage ||
        ownMessage.stickerMessage
      );
      if (ownHasMedia) source = ownMessage;
      else if (suppliedText) source = { conversation: suppliedText };
    }

    if (!source) {
      return extra.reply(
        '📢 *GSTATUS*\n\n' +
        '• `.gstatus Mon texte`\n' +
        '• réponds à une image/vidéo/GIF/audio/sticker avec `.gstatus`\n' +
        '• ajoute une légende avec `.gstatus Ma légende`'
      );
    }

    try {
      const posted = await postRealGroupStatus(sock, groupJid, source, quoted ? suppliedText : '');
      return extra.reply(`✅ Statut de groupe ${posted.type} envoyé à WhatsApp.`);
    } catch (error) {
      const code = error?.output?.statusCode || error?.data?.statusCode || error?.statusCode || error?.code || '';
      console.error('[gstatus] échec', { groupJid, code, error: error?.stack || error });
      return extra.reply(`❌ Échec du statut de groupe${code ? ` [${code}]` : ''}: ${error?.message || String(error)}`);
    }
  },
};
