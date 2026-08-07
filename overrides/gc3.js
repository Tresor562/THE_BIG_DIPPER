const { downloadMediaMessage, prepareWAMessageMedia, generateWAMessageFromContent } = require("@whiskeysockets/baileys");

const pino = require("pino");

async function gcstatusCommand(sock, chatId, m, args, reply) {

    // 1. Initial Checks

    await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

    // Check if Group

    if (!chatId.endsWith('@g.us')) {

        await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });

        return reply("❌ This command is for Groups only.");

    }

    // 2. Identify Content

    const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage || m.message;

    const isImage = quoted.imageMessage;

    const isVideo = quoted.videoMessage;

    const isAudio = quoted.audioMessage;

    const text = args.join(" ").trim();

    // Validate Input

    if (!isImage && !isVideo && !isAudio && !text) {

        await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });

        return reply("❌ **Usage:** Reply to media or type text.\n**Examples:**\n• `.gcstatus` (reply to image)\n• `.gcstatus Hello Group`");

    }

    try {

        console.log(`[GCSTATUS] Processing for ${chatId}`);

        

        let finalMediaMsg = {};

        // 3. Prepare Media

        if (isImage || isVideo || isAudio) {

            // Download Buffer

            const mediaBuffer = await downloadMediaMessage(

                { key: m.quoted ? m.quoted.key : m.key, message: quoted },

                'buffer',

                {},

                { logger: pino({ level: 'silent' }) }

            );

            // Construct Media Options (Strictly One Type to prevent 'stream' error)

            let mediaOptions = {};

            if (isImage) {

                mediaOptions = { image: mediaBuffer, caption: text || '' };

            } else if (isVideo) {

                mediaOptions = { video: mediaBuffer, caption: text || '' };

            } else if (isAudio) {

                mediaOptions = { audio: mediaBuffer, mimetype: 'audio/mp4', ptt: false };

            }

            // Upload using Bot's uploader

            const preparedMedia = await prepareWAMessageMedia(mediaOptions, { upload: sock.waUploadToServer });

            // Assign to final message structure

            if (isImage) finalMediaMsg = { imageMessage: preparedMedia.imageMessage };

            else if (isVideo) finalMediaMsg = { videoMessage: preparedMedia.videoMessage };

            else if (isAudio) finalMediaMsg = { audioMessage: preparedMedia.audioMessage };

            

        } else {

            // 4. Prepare Text

            // Generates a random color for the text background

            const randomHex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');

            finalMediaMsg = {

                extendedTextMessage: {

                    text: text,

                    backgroundArgb: 0xFF000000 + parseInt(randomHex, 16),

                    font: 2 // 1=Serif, 2=Norican(Standard Status), 3=Bryndan

                }

            };

        }

        // 5. Construct The Payload

        // 'groupStatusMessageV2' is the specific key for Group Icon Status

        const messagePayload = {

            groupStatusMessageV2: {

                message: finalMediaMsg

            }

        };

        // 6. Generate Message ID

        const msg = generateWAMessageFromContent(

            chatId, // Send TO the Group JID

            messagePayload, 

            { userJid: sock.user.id }

        );

        

        // 7. RELAY (Crucial Step)

        // We use relayMessage because standard sendMessage doesn't support groupStatusMessageV2 well

        await sock.relayMessage(chatId, msg.message, { messageId: msg.key.id });

        

        console.log('[GCSTATUS] Success via relayMessage');

        // Success Reaction

        await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

    } catch (error) {

        console.error("[GC STATUS ERROR]", error);

        await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });

        return reply(`❌ Error: ${error.message}`);

    }

}

module.exports = gcstatusCommand;
