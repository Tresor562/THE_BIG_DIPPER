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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    name: 'souverain',
    aliases: ['owner', 'creator', 'souverain_dev', 'developpeur', 'maitre', 'developper', 'architecte', 'king'],
    category: '🛠️ Outils généraux',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪɴᴠᴏǫᴜᴇ ʟᴇs ɪɴғᴏʀᴍᴀᴛɪᴏɴs sᴀᴄʀᴇᴇs ᴅᴜ ɢʀᴀɴᴅ ᴀʀᴄʜɪᴛᴇᴄᴛᴇ',
    usage: `${config.prefix || '.'}owner`,
    ownerOnly: false,
    groupOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
        const chatId = extra.from;

        try {
            // Une fiche indépendante par numéro. Des noms vCard distincts
            // empêchent certains clients WhatsApp de fusionner visuellement
            // les deux numéros comme s'ils appartenaient à une seule carte.
            const owners = [
                { number: '2290146202259', displayName: 'Trésor — Owner 1', firstName: 'Trésor', lastName: 'Owner 1' },
                { number: '2290155745907', displayName: 'Trésor — Owner 2', firstName: 'Trésor', lastName: 'Owner 2' },
            ];

            // 1. Réponse immédiate à la commande.
            await extra.reply(`*ɪɴᴄʟɪɴᴇ-ᴛᴏɪ... ᴠᴏɪᴄɪ ʟ'ᴀʀᴄʜɪᴛᴇᴄᴛᴇ ᴅᴇ ᴍᴏɴ ᴇssᴇɴᴄᴇ ᴇᴛ ʟᴇ ɢᴀʀᴅɪᴇɴ ᴅᴇ ᴍᴇs ᴄɪʀᴄᴜɪᴛs ♛.*`);

            // 2. Attendre exactement 5 secondes avant les contacts.
            await sleep(5000);

            // 3. Chaque envoi contient EXACTEMENT une vCard et un seul TEL/waid.
            // Le waid permet à WhatsApp d'associer la carte au compte et
            // d'ouvrir directement son IB depuis la fiche contact.
            for (let i = 0; i < owners.length; i++) {
                const owner = owners[i];
                const vcard = [
                    'BEGIN:VCARD',
                    'VERSION:3.0',
                    `N:${owner.lastName};${owner.firstName};;;`,
                    `FN:${owner.displayName}`,
                    'ORG:DIPPER Kingdom;',
                    `TEL;TYPE=CELL;TYPE=VOICE;waid=${owner.number}:+${owner.number}`,
                    'END:VCARD',
                ].join('\n');

                await sock.sendMessage(
                    chatId,
                    {
                        contacts: {
                            displayName: owner.displayName,
                            contacts: [{ vcard }],
                        },
                    },
                    chatId.endsWith('@g.us') ? { quoted: msg } : undefined
                );

                // Petit espacement pour forcer deux messages indépendants
                // dans l'interface et éviter toute impression de carte groupée.
                if (i < owners.length - 1) await sleep(750);
            }

            // 4. Réaction après l'envoi des deux contacts.
            await sock.sendMessage(chatId, { react: { text: '👑', key: msg.key } });

        } catch (error) {
            console.error('Souverain command error:', error);
            await extra.reply(`*❌ ${toSmallCaps('l\'invocation a echoue')}.*`);
        }
    }
};