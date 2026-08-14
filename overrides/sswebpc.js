'use strict';
const config = require('../../config.js');
const { takeScreenshot, normalizeUrl } = require('../../utils/screenshotApi');

const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789', s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

async function runScreenshot(sock, msg, args, extra, device) {
  const { reply, from, phrases } = extra;
  const icons = { pc: '🖥️', tablet: '📲' };
  const command = device === 'pc' ? 'sspc' : 'sstab';
  if (!args.length) return reply(`*📌 ᴜsᴀɢᴇ :* \`${config.prefix || '.'}${command} <url>\`\n\n${phrases.footer()}`);

  let url;
  try { url = normalizeUrl(args.join(' ')); }
  catch (err) { return reply(`*❌ ${SC(err.message)}*\n\n${phrases.footer()}`); }

  await sock.sendMessage(from, { react: { text: icons[device], key: msg.key } }).catch(()=>{});
  try {
    const image = await takeScreenshot(url, device);
    const label = device === 'pc' ? SC('bureau') : SC('tablette');
    await sock.sendMessage(from, {
      image,
      caption: `╭╼≪• *${icons[device]} ${SC('capture')} ${label}* •≫╾╮\n┃ 🌐 *${SC('url')}* : ${url}\n┃ 💻 *${SC('mode')}* : ${label}\n╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
    }, { quoted: msg });
    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
  } catch (err) {
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
    return reply(`*❌ ${SC('capture impossible')} :* _${err.message}_\n\n${phrases.footer()}`);
  }
}

module.exports = [
  {
    name:'sswebpc', aliases:['sspc','screenshotpc','captureweb_pc'], category:'🛠️ Outils généraux',
    description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ screenshot version bureau 🖥️', usage:`${config.prefix||'.'}sspc <url>`,
    groupOnly:false, adminOnly:false, botAdminNeeded:false,
    async execute(sock,msg,args,extra){ return runScreenshot(sock,msg,args,extra,'pc'); },
  },
  {
    name:'sswebtab', aliases:['sstab','screenshottab','captureweb_tab'], category:'🛠️ Outils généraux',
    description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ screenshot version tablette 📲', usage:`${config.prefix||'.'}sstab <url>`,
    groupOnly:false, adminOnly:false, botAdminNeeded:false,
    async execute(sock,msg,args,extra){ return runScreenshot(sock,msg,args,extra,'tablet'); },
  },
];
