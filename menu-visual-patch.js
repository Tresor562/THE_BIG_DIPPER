'use strict';

const fs = require('fs');
const path = require('path');

const BOT = path.join(__dirname, 'bot');
const file = path.join(BOT, 'commands', 'general_tools', 'menu.js');
if (!fs.existsSync(file)) throw new Error('[menu-visual] menu.js introuvable');

let src = fs.readFileSync(file, 'utf8');

function replaceOnce(search, replacement, label) {
  const count = src.split(search).length - 1;
  if (count === 0 && src.includes(replacement)) {
    console.log(`[menu-visual] ${label} déjà appliqué`);
    return;
  }
  if (count !== 1) throw new Error(`[menu-visual] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  console.log(`[menu-visual] ${label} appliqué`);
}

function replaceBlock(startNeedle, endNeedle, replacement, label) {
  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`[menu-visual] ${label}: bloc introuvable`);
  }
  src = src.slice(0, start) + replacement + src.slice(end);
  console.log(`[menu-visual] ${label} appliqué`);
}

function bodyOf(fn) {
  const text = fn.toString();
  return text.slice(text.indexOf('{') + 1, text.lastIndexOf('}')).trim();
}

// Ces fonctions TARGET ne sont jamais exécutées par ce script : leur source
// est injectée dans bot/commands/general_tools/menu.js après prepare.js.
async function TARGET_sendStyledMenuMessage(sock, jid, options = {}) {
  const {
    text = '',
    style = 0,
    imageUrl = null,
    quoted = null,
    mentions = [],
    withImage = true,
  } = options;

  const channelUrl = config.social?.whatsappChannel || 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
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

  let imageBuffer = null;
  if (withImage) {
    imageBuffer = imageUrl ? await getImageBufferFromUrl(imageUrl) : null;
    if (!imageBuffer) imageBuffer = await getImageBufferForStyle(style);
  }

  try {
    let header = proto.Message.InteractiveMessage.Header.create({
      title: '',
      subtitle: '',
      hasMediaAttachment: false,
    });

    if (imageBuffer) {
      const prepared = await prepareWAMessageMedia(
        { image: imageBuffer },
        { upload: sock.waUploadToServer }
      );
      header = proto.Message.InteractiveMessage.Header.create({
        ...prepared,
        title: '',
        subtitle: '',
        hasMediaAttachment: true,
      });
    }

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
      header,
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: '📢 Rejoindre la chaîne',
              url: channelUrl,
              merchant_url: channelUrl,
            }),
          },
        ],
      }),
      contextInfo,
    });

    const generated = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage,
          },
        },
      },
      { quoted: quoted || undefined, userJid: sock.user?.id }
    );

    await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });
    return generated;
  } catch (err) {
    console.warn('[Menu] interactive CTA indisponible, fallback standard:', err.message);
    const fallbackText = `${text}\n\n📢 *Chaîne officielle :* ${channelUrl}`;
    if (imageBuffer && fallbackText.length <= 1000) {
      return sock.sendMessage(
        jid,
        { image: imageBuffer, caption: fallbackText, contextInfo },
        quoted ? { quoted } : undefined
      );
    }
    if (imageBuffer) {
      await sock.sendMessage(
        jid,
        { image: imageBuffer, caption: '📚 THE BIG DIPPER', contextInfo },
        quoted ? { quoted } : undefined
      );
    }
    return sock.sendMessage(
      jid,
      { text: fallbackText, contextInfo },
      quoted ? { quoted } : undefined
    );
  }
}

function TARGET_buildCategoryDetail(style, catName, cmds, page = 1, context = {}) {
  const s = STYLES[style] || STYLES[1];
  const sorted = cmds.slice().sort((a, b) => a.name.localeCompare(b.name));
  const totalPages = Math.max(1, Math.ceil(sorted.length / COMMANDS_PER_PAGE));
  const p = Math.min(Math.max(1, page), totalPages);
  const pageItems = sorted.slice((p - 1) * COMMANDS_PER_PAGE, p * COMMANDS_PER_PAGE);
  const botName = context.botName || config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
  const ownerName = context.ownerName || 'Trésor';
  const userRank = context.userRank || toSmallCaps('utilisateur');
  const pfx = context.prefix || prefix;
  const senderJid = context.senderJid || '';
  const allCount = Number(context.count) || sorted.length;

  let text = buildImmersiveHeader(style, senderJid, allCount, botName);
  text += s.header(botName, ownerName, userRank, pfx, allCount);

  const pageLabel = totalPages > 1 ? ` — Page ${p}/${totalPages}` : '';
  text += s.catOpen(`${displayCategory(catName)}${pageLabel}`);
  pageItems.forEach(cmd => {
    text += s.catCmd({ ...cmd, name: `${pfx}${cmd.name}` });
  });
  text += s.catClose();
  text += `📜 *${sorted.length} commandes dans cette catégorie*\n`;
  if (totalPages > 1) {
    text += '➡️ Répondez *suivant*, *précédent* ou *page N* pour naviguer.\n';
  }
  text += '🔎 Répondez avec le *nom d\'une commande* pour voir sa fiche.\n';
  text += '0️⃣ Répondez avec *0* pour revenir au menu principal.\n\n';
  text += s.footer();
  text += SIGNATURE;
  return text;
}

function TARGET_buildAllMenuChunks(style, categoryNames, categories, prefixValue, count, context = {}, maxChars = 3200) {
  const s = STYLES[style] || STYLES[1];
  const botName = context.botName || config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
  const ownerName = context.ownerName || 'Trésor';
  const userRank = context.userRank || toSmallCaps('utilisateur');
  const senderJid = context.senderJid || '';
  const footer = `\n${s.footer()}${SIGNATURE}`;
  const firstHeader =
    buildImmersiveHeader(style, senderJid, count, botName) +
    s.header(botName, ownerName, userRank, prefixValue, count) +
    `📚 *ALL MENU — ${count} COMMANDES*\n\n`;

  const chunks = [];
  let current = firstHeader;
  let continuation = 1;

  const flush = () => {
    if (current.trim()) chunks.push((current + footer).trim());
    continuation++;
    current = `📚 *ALL MENU — SUITE ${continuation}*\n\n`;
  };

  for (const cat of categoryNames) {
    const cmds = (categories[cat] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const catTitle = displayCategory(cat);
    let open = s.catOpen(catTitle);
    const close = s.catClose();

    if ((current + open + close + footer).length > maxChars && current !== firstHeader) flush();
    current += open;

    for (const cmd of cmds) {
      const line = s.catCmd({ ...cmd, name: `${prefixValue}${cmd.name}` });
      if ((current + line + close + footer).length > maxChars) {
        current += close;
        flush();
        open = s.catOpen(`${catTitle} — suite`);
        current += open;
      }
      current += line;
    }
    current += close;
  }

  if (current.trim()) chunks.push((current + footer).trim());
  return chunks;
}

async function TARGET_allmenuBranch(body, rawSender, isSupreme, sock, extra, msg) {
  if (body === 'allmenu') {
    const ctx = buildMenuContext(rawSender, isSupreme, sock);
    const chunks = buildAllMenuChunks(
      ctx.styleActif,
      ctx.categoryNames,
      ctx.categories,
      prefix,
      ctx.count,
      { ...ctx, senderJid: rawSender }
    );
    for (let i = 0; i < chunks.length; i++) {
      await sendStyledMenuMessage(sock, extra.from, {
        text: chunks[i],
        style: ctx.styleActif,
        imageUrl: ctx.imageUrl || null,
        quoted: i === 0 ? msg : null,
        mentions: [rawSender],
        withImage: i === 0,
      });
    }
    return;
  }
}

async function TARGET_initialSend(sock, extra, menuText, styleActif, imageUrl, msg, rawSender) {
  const sentMsg = await sendStyledMenuMessage(sock, extra.from, {
    text: menuText,
    style: styleActif,
    imageUrl: imageUrl || null,
    quoted: msg,
    mentions: [rawSender],
    withImage: true,
  });
}

replaceOnce(
  "const { getConnectedOwnerName } = require('../../utils/ownerIdentity');",
  "const { getConnectedOwnerName } = require('../../utils/ownerIdentity');\nconst { proto, prepareWAMessageMedia, generateWAMessageFromContent } = require('@whiskeysockets/baileys');",
  'imports interactifs Baileys'
);

const senderHelper = TARGET_sendStyledMenuMessage
  .toString()
  .replace('TARGET_sendStyledMenuMessage', 'sendStyledMenuMessage') + '\n\n';
replaceOnce(
  '// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES — aperçu numéroté + réponse au menu',
  senderHelper + '// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES — aperçu numéroté + réponse au menu',
  'expéditeur visuel commun'
);

const styledCategoryDetail = TARGET_buildCategoryDetail
  .toString()
  .replace('TARGET_buildCategoryDetail', 'buildCategoryDetail') + '\n\n';
replaceBlock(
  'function buildCategoryDetail(catName, cmds, page = 1) {',
  '// ══════════════════════════════════════════════════════════════\n// 🔎 MOTEUR DE RECHERCHE & CORRECTION FLOUE',
  styledCategoryDetail,
  'catégories stylées'
);

replaceOnce(
  "  const sendAndTrack = async (text, extraData = {}) => {\n    const sentMsg = await sock.sendMessage(extra.from, { text }, { quoted: msg });\n    if (sentMsg?.key?.id) trackMenu(sentMsg.key.id, { ...entry, ...extraData });\n    return sentMsg;\n  };",
  "  const sendAndTrack = async (text, extraData = {}) => {\n    const merged = { ...entry, ...extraData };\n    const sentMsg = await sendStyledMenuMessage(sock, extra.from, {\n      text, style: merged.style, imageUrl: merged.imageUrl || null,\n      quoted: msg, mentions: [merged.senderJid], withImage: true,\n    });\n    if (sentMsg?.key?.id) trackMenu(sentMsg.key.id, merged);\n    return sentMsg;\n  };",
  'navigation visuelle'
);

replaceOnce(
  "      quoted?.videoMessage?.caption || ''",
  "      quoted?.videoMessage?.caption ||\n      quoted?.viewOnceMessage?.message?.interactiveMessage?.body?.text ||\n      quoted?.viewOnceMessageV2?.message?.interactiveMessage?.body?.text ||\n      quoted?.viewOnceMessageV2Extension?.message?.interactiveMessage?.body?.text || ''",
  'fallback quote interactif'
);

replaceOnce(
  "      senderJid: rawSender,\n      currentCategory: null,",
  "      senderJid: rawSender,\n      imageUrl: rebuilt.imageUrl || null,\n      currentCategory: null,",
  'image personnalisée reconstruite'
);

replaceOnce(
  '    const text    = buildCategoryDetail(catName, cmds, 1);',
  '    const text = buildCategoryDetail(entry.style, catName, cmds, 1, entry);',
  'ouverture catégorie stylée'
);
replaceOnce(
  '      const text = buildCategoryDetail(entry.currentCategory, cmds, targetPage);',
  '      const text = buildCategoryDetail(entry.style, entry.currentCategory, cmds, targetPage, entry);',
  'pagination catégorie stylée'
);

const allMenuStart = src.indexOf('function buildAllMenuChunks(');
const allMenuEnd = allMenuStart === -1 ? -1 : src.indexOf('\nmodule.exports = {', allMenuStart);
if (allMenuStart === -1 || allMenuEnd === -1) {
  throw new Error('[menu-visual] helper allmenu introuvable après prepare.js');
}
const styledAllMenu = TARGET_buildAllMenuChunks
  .toString()
  .replace('TARGET_buildAllMenuChunks', 'buildAllMenuChunks') + '\n\n';
src = src.slice(0, allMenuStart) + styledAllMenu + src.slice(allMenuEnd);
console.log('[menu-visual] allmenu stylé appliqué');

const allExecStart = src.indexOf("      if (body === 'allmenu') {");
const allExecEndNeedle = "\n\n      const styleMatch = body.match(/^style(\\d+)$/);";
const allExecEnd = allExecStart === -1 ? -1 : src.indexOf(allExecEndNeedle, allExecStart);
if (allExecStart === -1 || allExecEnd === -1) throw new Error('[menu-visual] branche allmenu introuvable');
const allExecReplacement = bodyOf(TARGET_allmenuBranch);
src = src.slice(0, allExecStart) + '      ' + allExecReplacement.replace(/\n/g, '\n      ') + src.slice(allExecEnd);
console.log('[menu-visual] exécution allmenu visuelle appliquée');

const oldInitialStart = src.indexOf('      // Image personnalisée si configurée et valide, sinon image du style');
const oldInitialEndNeedle = '\n\n      // Mémorise ce menu pour permettre la navigation par réponse';
const oldInitialEnd = oldInitialStart === -1 ? -1 : src.indexOf(oldInitialEndNeedle, oldInitialStart);
if (oldInitialStart === -1 || oldInitialEnd === -1) throw new Error('[menu-visual] bloc envoi menu principal introuvable');
const initialBody = bodyOf(TARGET_initialSend).replace(/\n/g, '\n      ');
src = src.slice(0, oldInitialStart) + '      ' + initialBody + src.slice(oldInitialEnd);
console.log('[menu-visual] menu principal unifié appliqué');

replaceOnce(
  '          categoryNames, categories, count, senderJid: rawSender,\n          currentCategory: null,',
  '          categoryNames, categories, count, senderJid: rawSender, imageUrl: imageUrl || null,\n          currentCategory: null,',
  'tracking image menu'
);

fs.writeFileSync(file, src);
console.log('[menu-visual] ✅ menu, catégories et allmenu utilisent style + image + footer + bouton chaîne');
