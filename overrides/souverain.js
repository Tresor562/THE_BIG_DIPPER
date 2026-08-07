/**
 * Owner Command - 𝐃𝐚𝐫𝐤 Prestige Edition
 * Nom d'invocation : souverain
 */

const config = require('../../config');

// Fonction pour le style Small Caps (Cohérence visuelle du sanctuaire)
function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

module.exports = {
    name: 'souverain',
    aliases: ['owner', 'creator', 'souverain_dev', 'developpeur' ,'maitre', 'developper','architecte', 'king'],
    category: '🛠️ Outils généraux',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪɴᴠᴏǫᴜᴇ ʟᴇs ɪɴғᴏʀᴍᴀᴛɪᴏɴs sᴀᴄʀᴇᴇs ᴅᴜ ɢʀᴀɴᴅ ᴀʀᴄʜɪᴛᴇᴄᴛᴇ',
    usage: `${config.prefix || '.'}souverain`,
    ownerOnly: false,
    groupOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
        const chatId = extra.from;

        try {
            // Tes deux numéros Supreme Owner, immuables
            const myNumbers = ["2290146202259", "2290155745907"];
            const myName ="Trésor";

            // 1. Message d'introduction mystique
            await extra.reply(`*ɪɴᴄʟɪɴᴇ-ᴛᴏɪ... ᴠᴏɪᴄɪ ʟ'ᴀʀᴄʜɪᴛᴇᴄᴛᴇ ᴅᴇ ᴍᴏɴ ᴇssᴇɴᴄᴇ ᴇᴛ ʟᴇ ɢᴀʀᴅɪᴇɴ ᴅᴇ ᴍᴇs ᴄɪʀᴄᴜɪᴛs ♛.*`);

            // 2. Deux numéros = deux cartes de contact distinctes.
            // Une seule vCard avec deux TEL est fusionnée par WhatsApp en
            // un seul contact ; on crée donc une vCard et un message par numéro.
            for (const number of myNumbers) {
                const vcard = 'BEGIN:VCARD\n' +
                    'VERSION:3.0\n' +
                    `FN:${myName}\n` +
                    `ORG:DIPPER Kingdom;\n` +
                    `TEL;type=CELL;type=VOICE;waid=${number}:+${number}\n` +
                    'END:VCARD';

                await sock.sendMessage(chatId, {
                    contacts: {
                        displayName: myName,
                        contacts: [{ vcard }]
                    }
                }, chatId.endsWith('@g.us') ? { quoted: msg } : undefined);
            }

            // 3. Réaction de respect royal
            await sock.sendMessage(chatId, { react: { text: "👑", key: msg.key } });

        } catch (error) {
            console.error('Souverain command error:', error);
            await extra.reply(`*❌ ${toSmallCaps('l\'invocation a echoue')}.*`);
        }
    }
};