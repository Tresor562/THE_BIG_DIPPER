'use strict';

/**
 * Ping Style 0 — THE BIG DIPPER
 * Habillage inspiré du panneau Sarada MD fourni par le propriétaire,
 * avec métriques système réelles et identité Dipper.
 */
const os = require('os');
const config = require('../../config');
const styleManager = require('../../utils/styleManager');
const { getConnectedOwnerName } = require('../../utils/ownerIdentity');

function normalizePhone(value) {
  const raw = String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return raw.length >= 7 ? raw : '';
}

function getConnectedPhoneNumber(sock) {
  const candidates = [
    sock?._sessionPhoneNumber,
    sock?.user?.id,
    sock?.authState?.creds?.me?.id,
    sock?.authState?.creds?.me?.lid,
  ];
  for (const candidate of candidates) {
    const number = normalizePhone(candidate);
    if (number) return number;
  }
  const configured = Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : config.ownerNumber;
  return normalizePhone(configured) || 'N/A';
}

function getMode() {
  if (config.selfMode) return 'self';
  if (config.public) return 'public';
  return 'semi-public';
}

function getCommandCount() {
  try {
    if (global.commands instanceof Map) {
      return new Set(global.commands.values()).size;
    }
  } catch (_) {}
  return 0;
}

function getVersion() {
  try {
    return require('../../package.json').version || '1.0.0';
  } catch (_) {
    return '1.0.0';
  }
}

function formatUptime() {
  const uptime = Math.floor(process.uptime());
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = uptime % 60;
  return `${d ? `${d}j ` : ''}${h}h ${m}m ${s}s`;
}

function getNewsletterContext() {
  return {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',
      serverMessageId: -1,
    },
  };
}

// [PING SINGLE RESPONSE]
// Mesure la latence via la présence WhatsApp sans envoyer une bulle de sonde
// qui devrait ensuite être supprimée. Le ping reste donc une réponse unique.
async function measureLatencyWithoutMessage(sock, from) {
  const start = Date.now();
  if (typeof sock?.sendPresenceUpdate !== 'function') return 1;
  try {
    await Promise.race([
      sock.sendPresenceUpdate('composing', from),
      new Promise(resolve => {
        const timer = setTimeout(resolve, 1500);
        if (timer.unref) timer.unref();
      }),
    ]);
  } catch (_) {}
  Promise.resolve(sock.sendPresenceUpdate('paused', from)).catch(() => {});
  return Math.max(1, Date.now() - start);
}

module.exports = {
  name: 'ping',
  aliases: ['vitesse', 'p', 'flux', 'latence', 'uping', 'pingpremium'],
  category: '🛠️ Outils généraux',
  description: 'Affiche la latence et les informations système de THE BIG DIPPER.',
  usage: `${config.prefix || '.'}ping`,

  async execute(sock, msg, args, extra) {
    const { reply, from } = extra;

    try {
      const latency = await measureLatencyWithoutMessage(sock, from);
      const totalRam = os.totalmem();
      const freeRam = os.freemem();
      const usedRam = totalRam - freeRam;
      const ramUsedGb = (usedRam / 1024 ** 3).toFixed(1);
      const ramTotalGb = (totalRam / 1024 ** 3).toFixed(1);
      const memoryMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
      const heapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      const cpuLoad = Number(os.loadavg?.()[0] || 0).toFixed(2);
      const host = os.hostname() || process.env.HOSTNAME || 'N/A';
      const serverId = process.env.RENDER_INSTANCE_ID || process.env.RENDER_SERVICE_ID || 'N/A';
      const prefix = config.prefix || '.';
      const ownerName = getConnectedOwnerName(
        sock,
        Array.isArray(config.ownerName) ? config.ownerName[0] : (config.ownerName || 'Trésor')
      );
      const ownerNumber = getConnectedPhoneNumber(sock);
      const botName = config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
      const commandCount = getCommandCount();
      const version = getVersion();

      const text =
        `╭━━❑ *${botName}* ❑━━⚯\n` +
        `┃𓊈⭐𓊉 *𝐏𝐑𝐄𝐅𝐈𝐗* : \`${prefix}\`\n` +
        `┃𓊈⭐𓊉 *𝐌𝐎𝐃𝐄* : ${getMode()}\n` +
        `┃𓊈⭐𓊉 *𝐎𝐖𝐍𝐄𝐑* : ${ownerName}${ownerNumber !== 'N/A' ? ` (+${ownerNumber})` : ''}\n` +
        `┃𓊈⭐𓊉 *𝐕𝐄𝐑𝐒𝐈𝐎𝐍* : *${version}*\n` +
        `┃𓊈⭐𓊉 *𝐂𝐌𝐃𝐒* : ${commandCount}\n` +
        `╰━━━━━━━━━━━━━━━⚯\n\n` +
        `╭─❑ *𝐈𝐍𝐅𝐎𝐒 𝐒𝐘𝐒𝐓𝐄̀𝐌𝐄* ❑─⚯\n` +
        `┃☍╭⚬𝐒𝐭𝐚𝐭𝐮𝐭: 🟢 Online\n` +
        `┃☍│⚬𝐋𝐚𝐭𝐞𝐧𝐜𝐲: ${latency}ms\n` +
        `┃☍│⚬𝐇𝐨𝐬𝐭: ${host}\n` +
        `┃☍│⚬𝐈𝐃 𝐬𝐞𝐫𝐯𝐞𝐫: ${serverId}\n` +
        `┃☍│⚬𝐂𝐩𝐮 𝐥𝐨𝐚𝐝: ${cpuLoad}\n` +
        `┃☍│⚬𝐑𝐚𝐦: ${ramUsedGb} Go / ${ramTotalGb} Go\n` +
        `┃☍│⚬𝐌𝐞𝐦𝐨𝐫𝐲: ${memoryMb} Mo\n` +
        `┃☍│⚬𝐇𝐞𝐚𝐩: ${heapMb} Mo\n` +
        `┃☍╰⚬𝐔𝐩𝐭𝐢𝐦𝐞: ${formatUptime()}\n` +
        `╰━━━━━━━━━━━━━━━⚯\n` +
        `> 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑`;

      // [PING DUAL CHANNEL CTA]
      // Utilise le même moteur interactif que menu/allmenu afin de conserver
      // une seule réponse et la CTA newsletter attendue par le runtime.
      try {
        const menu = require('./menu');
        if (typeof menu.sendStyledMenuMessage === 'function') {
          return await menu.sendStyledMenuMessage(sock, from, {
            text,
            style: styleManager.getStyle(),
            quoted: from?.endsWith('@g.us') ? msg : null,
            mentions: [],
            withImage: false,
          });
        }
      } catch (_) {}

      return await sock.sendMessage(
        from,
        { text, contextInfo: getNewsletterContext() },
        from?.endsWith('@g.us') ? { quoted: msg } : undefined
      );
    } catch (err) {
      return reply(`❌ Erreur ping : ${err.message}`);
    }
  },
};
