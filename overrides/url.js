'use strict';
const config = require('../../config.js');
const prefix = config.prefix || '.';
const axios = require('axios');
const FormData = require('form-data');
const FileType = require('file-type');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const CATBOX_API = 'https://catbox.moe/user/api.php';
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const detectFileType = FileType.fileTypeFromBuffer || FileType.fromBuffer;

function unwrapQuoted(message) {
  let current = message;
  for (let i = 0; i < 4 && current; i++) {
    if (current.ephemeralMessage?.message) { current = current.ephemeralMessage.message; continue; }
    if (current.viewOnceMessage?.message) { current = current.viewOnceMessage.message; continue; }
    if (current.viewOnceMessageV2?.message) { current = current.viewOnceMessageV2.message; continue; }
    if (current.viewOnceMessageV2Extension?.message) { current = current.viewOnceMessageV2Extension.message; continue; }
    break;
  }
  return current;
}

function mediaKind(quoted) {
  return ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].find(key => quoted?.[key]) || null;
}

function safeFilename(media, ext) {
  const original = String(media?.fileName || '').trim().replace(/[\\/:*?"<>|\r\n]/g, '_');
  if (original) return original;
  return `dipper_${Date.now()}.${ext || 'bin'}`;
}

async function uploadCatbox(buffer, filename) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  const userhash = String(process.env.CATBOX_USERHASH || '').trim();
  if (userhash) form.append('userhash', userhash);
  form.append('fileToUpload', buffer, { filename });

  const response = await axios.post(CATBOX_API, form, {
    headers: form.getHeaders(),
    timeout: 60000,
    maxContentLength: MAX_UPLOAD_BYTES + 1024,
    maxBodyLength: MAX_UPLOAD_BYTES + 1024,
    validateStatus: status => status >= 200 && status < 500,
  });
  if (response.status >= 400) throw new Error(`Catbox HTTP ${response.status}`);
  const url = typeof response.data === 'string' ? response.data.trim() : '';
  if (!/^https:\/\/files\.catbox\.moe\/[A-Za-z0-9._-]+$/i.test(url)) {
    throw new Error(url ? `Réponse Catbox invalide: ${url.slice(0, 120)}` : 'Réponse Catbox vide');
  }
  return url;
}

module.exports = {
  name: 'tourl', aliases: ['url', 'makeurl', 'upload', 'catbox'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ convertit un média en URL publique via Catbox',
  usage: `${prefix}url (répondre à une image/vidéo/audio/sticker/document)`,
  groupOnly:false, adminOnly:false, botAdminNeeded:false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId = extra.from || msg.key.remoteJid;
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = unwrapQuoted(ctx?.quotedMessage);
      const mediaType = mediaKind(quoted);
      if (!quoted || !mediaType) {
        return reply(`⚠️ *Réponds à une image, vidéo, audio, sticker ou document.*\n\n${extra.phrases.footer()}`);
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } }).catch(()=>{});
      const media = quoted[mediaType];
      const stream = await downloadContentFromMessage(media, mediaType.replace('Message', ''));
      const chunks = [];
      let size = 0;
      for await (const chunk of stream) {
        const part = Buffer.from(chunk);
        size += part.length;
        if (size > MAX_UPLOAD_BYTES) throw new Error('Média trop volumineux (> 200 Mo)');
        chunks.push(part);
      }
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) throw new Error('Téléchargement WhatsApp vide');

      let type = null;
      if (typeof detectFileType === 'function') {
        try { type = await detectFileType(buffer); } catch (_) {}
      }
      const ext = type?.ext || String(media?.fileName || '').split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
      const filename = safeFilename(media, ext);
      const mediaUrl = await uploadCatbox(buffer, filename);

      const externalAdReply = {
        title: '𝐃𝐈𝐏𝐏𝐄𝐑', body: 'Conversion terminée.', sourceUrl: mediaUrl,
        mediaUrl, mediaType: 1, showAdAttribution: false,
      };
      if (mediaType === 'imageMessage' && buffer.length <= 5 * 1024 * 1024) externalAdReply.thumbnail = buffer;

      await sock.sendMessage(chatId, {
        text: `🌐 *ʟɪᴇɴ :* ${mediaUrl}\n\n${extra.phrases.footer()}`,
        contextInfo: { externalAdReply },
      }, { quoted: msg });
      await sock.sendMessage(chatId, { react: { text: '🔗', key: msg.key } }).catch(()=>{});
    } catch (error) {
      console.error('[tourl]', error);
      await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      return reply(`❌ *Impossible de créer le lien :* _${error.message}_\n\n${extra.phrases.footer()}`);
    }
  },
};
