'use strict';
const config = require('../../config.js');
const { takeScreenshot, normalizeUrl } = require('../../utils/screenshotApi');

function toSmallCaps(text) {
  const normal = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const smallCaps = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split('').map(c => {
    const i = normal.indexOf(c); return i !== -1 ? smallCaps[i] : c;
  }).join('');
}

module.exports = {
  name: 'ssweb', aliases: ['screenshot', 'ss', 'webss', 'capture'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ capture mobile d’un site web',
  usage: `${config.prefix || '.'}ssweb <url>`,
  groupOnly: false, adminOnly: false, botAdminNeeded: false,
  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;
    if (!args.length) return reply(`*📌 ᴜsᴀɢᴇ :* \`${config.prefix || '.'}ssweb <url>\`\n\n${phrases.footer()}`);
    let url;
    try { url = normalizeUrl(args.join(' ')); }
    catch (err) { return reply(`*❌ ${toSmallCaps(err.message)}*\n\n${phrases.footer()}`); }

    await sock.sendMessage(from, { react: { text: '📱', key: msg.key } }).catch(() => {});
    try {
      const image = await takeScreenshot(url, 'mobile');
      await sock.sendMessage(from, {
        image,
        caption: `╭╼≪• *📱 ${toSmallCaps('capture mobile')}* •≫╾╮\n┃ 🌐 *${toSmallCaps('url')}* : ${url}\n╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
      }, { quoted: msg });
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
      return reply(`*❌ ${toSmallCaps('capture impossible')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  },
};
