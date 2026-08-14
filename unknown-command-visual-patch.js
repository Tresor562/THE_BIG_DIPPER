'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const marker = '[UNKNOWN COMMAND — STYLED INTERACTIVE]';

if (!fs.existsSync(menuPath)) throw new Error('[unknown-visual] menu.js introuvable');

let src = fs.readFileSync(menuPath, 'utf8');

if (!src.includes(marker)) {
  const startNeedle = 'async function handleUnknownCommand(sock, msg, extra, typedName, typedArgs) {';
  const endNeedle = 'module.exports.handleUnknownCommand = handleUnknownCommand;';
  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);
  if (start === -1 || end === -1) throw new Error('[unknown-visual] handleUnknownCommand introuvable');

  const replacement = `// [UNKNOWN COMMAND — STYLED INTERACTIVE]\n` +
`function buildUnknownCommandVisual(ctx, title, cmds = [], mode = 'results') {\n` +
`  const style = Number.isInteger(ctx.styleActif) ? ctx.styleActif : styleManager.getStyle();\n` +
`  const s = STYLES[style] || STYLES[0] || STYLES[1];\n` +
`  const botName = ctx.botName || config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';\n` +
`  const ownerName = ctx.ownerName || 'Trésor';\n` +
`  const userRank = ctx.userRank || toSmallCaps('utilisateur');\n` +
`  const senderJid = ctx.senderJid || '';\n` +
`  const count = Number(ctx.count) || getCommandIndex().length;\n` +
`  let text = buildImmersiveHeader(style, senderJid, count, botName);\n` +
`  text += s.header(botName, ownerName, userRank, prefix, count);\n` +
`  text += s.catOpen(title);\n` +
`\n` +
`  if (mode === 'results') {\n` +
`    cmds.forEach((cmd, i) => {\n` +
`      text += s.catCmd({ ...cmd, name: \`\${i + 1}. \${prefix}\${cmd.name}\` });\n` +
`    });\n` +
`  } else if (mode === 'confirm' && cmds[0]) {\n` +
`    text += '┃⚠️ La commande saisie n’existe pas.\\n';\n` +
`    text += '┃✅ Correction proposée :\\n';\n` +
`    text += s.catCmd({ ...cmds[0], name: \`\${prefix}\${cmds[0].name}\` });\n` +
`  } else {\n` +
`    text += '┃⚠️ Aucune commande suffisamment proche n’a été trouvée.\\n';\n` +
`  }\n` +
`\n` +
`  text += s.catClose();\n` +
`  if (mode === 'results') {\n` +
`    text += '💬 *Répondez avec le numéro pour voir la fiche de la commande.*\\n';\n` +
`    text += '0️⃣ *Répondez avec 0 pour revenir au menu principal.*\\n\\n';\n` +
`  } else if (mode === 'confirm') {\n` +
`    text += '💬 *Répondez oui pour exécuter la correction proposée.*\\n';\n` +
`    text += '0️⃣ *Répondez avec 0 pour revenir au menu principal.*\\n\\n';\n` +
`  } else {\n` +
`    text += \`💡 *Tapez \${prefix}menu pour afficher toutes les commandes.*\\n\\n\`;\n` +
`  }\n` +
`  text += s.footer();\n` +
`  return { text, style };\n` +
`}\n` +
`\n` +
`async function sendUnknownCommandVisual(sock, msg, extra, ctx, visual) {\n` +
`  const sharedSender = module.exports.sendStyledMenuMessage;\n` +
`  if (typeof sharedSender === 'function') {\n` +
`    return sharedSender(sock, extra.from, {\n` +
`      text: visual.text,\n` +
`      style: visual.style,\n` +
`      imageUrl: ctx.imageUrl || null,\n` +
`      quoted: msg,\n` +
`      mentions: [ctx.senderJid].filter(Boolean),\n` +
`      withImage: false,\n` +
`    });\n` +
`  }\n` +
`\n` +
`  // Fallback autonome pour les lancements directs de DIPPER- sans le wrapper Render.\n` +
`  const channelUrl = config.social?.whatsappChannel || 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';\n` +
`  const contextInfo = {\n` +
`    mentionedJid: [ctx.senderJid].filter(Boolean),\n` +
`    forwardingScore: 1,\n` +
`    isForwarded: true,\n` +
`    forwardedNewsletterMessageInfo: {\n` +
`      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',\n` +
`      newsletterName: config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',\n` +
`      serverMessageId: -1,\n` +
`    },\n` +
`  };\n` +
`  try {\n` +
`    const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');\n` +
`    const interactiveMessage = proto.Message.InteractiveMessage.create({\n` +
`      body: proto.Message.InteractiveMessage.Body.create({ text: visual.text }),\n` +
`      footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),\n` +
`      header: proto.Message.InteractiveMessage.Header.create({ title: '', subtitle: '', hasMediaAttachment: false }),\n` +
`      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({\n` +
`        buttons: [{\n` +
`          name: 'cta_url',\n` +
`          buttonParamsJson: JSON.stringify({\n` +
`            display_text: '📢 Rejoindre la chaîne',\n` +
`            url: channelUrl,\n` +
`            merchant_url: channelUrl,\n` +
`          }),\n` +
`        }],\n` +
`      }),\n` +
`      contextInfo,\n` +
`    });\n` +
`    const generated = generateWAMessageFromContent(extra.from, {\n` +
`      viewOnceMessage: {\n` +
`        message: {\n` +
`          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },\n` +
`          interactiveMessage,\n` +
`        },\n` +
`      },\n` +
`    }, { quoted: msg, userJid: sock.user?.id });\n` +
`    await sock.relayMessage(extra.from, generated.message, { messageId: generated.key.id });\n` +
`    return generated;\n` +
`  } catch (_) {\n` +
`    return sock.sendMessage(extra.from, { text: visual.text, contextInfo }, { quoted: msg });\n` +
`  }\n` +
`}\n` +
`\n` +
`async function handleUnknownCommand(sock, msg, extra, typedName, typedArgs) {\n` +
`  const fuzzy = fuzzyMatchCommand(typedName);\n` +
`  const rawSender = extra.sender || msg.key.participant || msg.key.remoteJid;\n` +
`  const isSupreme = SUPREME_JIDS.includes(rawSender) || extra.isOwner || msg.key.fromMe;\n` +
`  const ctx = { ...buildMenuContext(rawSender, isSupreme, sock), senderJid: rawSender };\n` +
`\n` +
`  if (fuzzy.confirmCandidate) {\n` +
`    const visual = buildUnknownCommandVisual(ctx, 'COMMANDE INCONNUE', [fuzzy.confirmCandidate], 'confirm');\n` +
`    const sentMsg = await sendUnknownCommandVisual(sock, msg, extra, ctx, visual);\n` +
`    if (sentMsg?.key?.id) {\n` +
`      trackMenu(sentMsg.key.id, {\n` +
`        ...ctx, prefix, senderJid: rawSender,\n` +
`        mode: 'confirm', pendingCommandName: fuzzy.confirmCandidate.name,\n` +
`        pendingArgs: typedArgs || [], originalMsg: msg,\n` +
`        currentCategory: null, currentPage: 1, resultList: null,\n` +
`      });\n` +
`    }\n` +
`    return { handled: true };\n` +
`  }\n` +
`\n` +
`  if (fuzzy.suggestions.length) {\n` +
`    const visual = buildUnknownCommandVisual(ctx, 'COMMANDE INCONNUE — VOULEZ-VOUS DIRE', fuzzy.suggestions, 'results');\n` +
`    const sentMsg = await sendUnknownCommandVisual(sock, msg, extra, ctx, visual);\n` +
`    if (sentMsg?.key?.id) {\n` +
`      trackMenu(sentMsg.key.id, {\n` +
`        ...ctx, prefix, senderJid: rawSender,\n` +
`        currentCategory: null, currentPage: 1,\n` +
`        mode: 'results', resultList: fuzzy.suggestions,\n` +
`      });\n` +
`    }\n` +
`    return { handled: true };\n` +
`  }\n` +
`\n` +
`  const visual = buildUnknownCommandVisual(ctx, 'COMMANDE INCONNUE', [], 'none');\n` +
`  await sendUnknownCommandVisual(sock, msg, extra, ctx, visual);\n` +
`  return { handled: true };\n` +
`}\n` +
`module.exports.handleUnknownCommand = handleUnknownCommand;`;

  src = src.slice(0, start) + replacement + src.slice(end + endNeedle.length);
  fs.writeFileSync(menuPath, src, 'utf8');
  console.log('[unknown-visual] suggestions inconnues stylées + interactives installées');
} else {
  console.log('[unknown-visual] déjà installé');
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`[unknown-visual] menu invalide: ${check.stderr || check.stdout}`);

const finalSrc = fs.readFileSync(menuPath, 'utf8');
for (const required of [
  marker,
  'sendUnknownCommandVisual',
  'buildUnknownCommandVisual',
  'module.exports.sendStyledMenuMessage',
  'forwardedNewsletterMessageInfo',
  "display_text: '📢 Rejoindre la chaîne'",
]) {
  if (!finalSrc.includes(required)) throw new Error(`[unknown-visual] garde-fou absent: ${required}`);
}
if (finalSrc.includes("buildResultsList('Commande inconnue — vouliez-vous dire'")) {
  throw new Error('[unknown-visual] ancien chemin texte de suggestions encore actif');
}
console.log('[unknown-visual] ✅ commande inconnue = style actif + newsletter + CTA + footer du style');
