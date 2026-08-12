'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const handlerPath = path.join(BOT, 'handler.js');
const welcomeCardPath = path.join(BOT, 'utils', 'welcomeCard.js');
const welcomeOverride = path.join(ROOT, 'overrides', 'welcomeCard.js');

for (const f of [menuPath, handlerPath, welcomeOverride]) {
  if (!fs.existsSync(f)) throw new Error(`[welcome-card] fichier absent: ${f}`);
}

fs.copyFileSync(welcomeOverride, welcomeCardPath);
console.log('[welcome-card] utils/welcomeCard.js installé');

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count === 0 && source.includes(replacement)) {
    console.log(`[welcome-card] ${label} déjà appliqué`);
    return source;
  }
  if (count !== 1) throw new Error(`[welcome-card] ${label}: attendu 1 occurrence, trouvé ${count}`);
  console.log(`[welcome-card] ${label} appliqué`);
  return source.replace(search, replacement);
}

function patchMenuGeneratedImagePriority(source) {
  const start = source.indexOf('async function sendStyledMenuMessage(');
  if (start === -1) throw new Error('[welcome-card] sendStyledMenuMessage introuvable');

  // La fin est le début de la section qui suit l'expéditeur visuel. On ne
  // modifie que cette fonction afin de ne jamais toucher aux autres usages
  // de imageBuffer dans menu.js.
  const navMarker = '// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES';
  const end = source.indexOf(navMarker, start);
  if (end === -1) throw new Error('[welcome-card] fin de sendStyledMenuMessage introuvable');

  let sender = source.slice(start, end);

  if (!sender.includes('imageBuffer: providedImageBuffer = null,')) {
    const optionNeedle = '    withImage = true,\n';
    const count = sender.split(optionNeedle).length - 1;
    if (count !== 1) throw new Error(`[welcome-card] option withImage: attendu 1 occurrence, trouvé ${count}`);
    sender = sender.replace(optionNeedle, optionNeedle + '    imageBuffer: providedImageBuffer = null,\n');
    console.log('[welcome-card] imageBuffer direct dans sendStyledMenuMessage appliqué');
  } else {
    console.log('[welcome-card] imageBuffer direct dans sendStyledMenuMessage déjà appliqué');
  }

  const alreadyPrioritized = sender.includes('let imageBuffer = providedImageBuffer || null;')
    && sender.includes('if (withImage && !imageBuffer) {');

  if (!alreadyPrioritized) {
    const decl = 'let imageBuffer = null;';
    const cond = 'if (withImage) {';
    const declCount = sender.split(decl).length - 1;
    const condCount = sender.split(cond).length - 1;
    if (declCount !== 1) throw new Error(`[welcome-card] déclaration imageBuffer dans expéditeur: attendu 1 occurrence, trouvé ${declCount}`);
    if (condCount !== 1) throw new Error(`[welcome-card] condition withImage dans expéditeur: attendu 1 occurrence, trouvé ${condCount}`);

    sender = sender.replace(decl, 'let imageBuffer = providedImageBuffer || null;');
    sender = sender.replace(cond, 'if (withImage && !imageBuffer) {');
    console.log('[welcome-card] priorité image générée appliquée structurellement');
  } else {
    console.log('[welcome-card] priorité image générée déjà appliquée');
  }

  return source.slice(0, start) + sender + source.slice(end);
}

// ── 1) Étendre l'expéditeur interactif du menu pour accepter une image
// déjà construite (welcome/goodbye), sans dépendre de la mise en forme du
// bloc réseau que interactive-delivery-guard.js peut enrichir avec timeouts.
let menu = fs.readFileSync(menuPath, 'utf8');
menu = patchMenuGeneratedImagePriority(menu);

if (!menu.includes('module.exports.sendStyledMenuMessage = sendStyledMenuMessage;')) {
  menu += "\n\n// API visuelle partagée : welcome/goodbye réutilisent exactement le moteur du menu.\nmodule.exports.sendStyledMenuMessage = sendStyledMenuMessage;\nmodule.exports.getImageBufferForStyle = getImageBufferForStyle;\n";
  console.log('[welcome-card] helpers visuels du menu exportés');
}
fs.writeFileSync(menuPath, menu);

// ── 2) Brancher les cartes dans les événements de groupe.
let handler = fs.readFileSync(handlerPath, 'utf8');
handler = replaceOnce(
  handler,
  "const styleManager             = require('./utils/styleManager');",
  "const styleManager             = require('./utils/styleManager');\nconst { sendGroupEventCard }   = require('./utils/welcomeCard');",
  'import welcomeCard'
);

// Mémoriser les pushName vus pendant la vie du process. Le resolver de la
// carte les réutilise si WhatsApp ne renvoie pas de nom dans group update.
handler = replaceOnce(
  handler,
  "    const isSuperMe = isSupremeOwner(sender);",
  "    if (!(global._dipperMemberNames instanceof Map)) global._dipperMemberNames = new Map();\n    if (msg.pushName) {\n      const senderNumForName = String(sender || '').split(':')[0].split('@')[0].replace(/\\D/g, '');\n      global._dipperMemberNames.set(sender, msg.pushName);\n      if (senderNumForName) global._dipperMemberNames.set(senderNumForName, msg.pushName);\n    }\n\n    const isSuperMe = isSupremeOwner(sender);",
  'cache pushName'
);

// Le générateur récupère lui-même la PP avec timeout et fallback. Supprimer
// l'ancien téléchargement pour éviter deux requêtes réseau par événement.
const oldProfileBlock = `      // [PERF FIX] profilePictureUrl avec timeout 5s pour ne pas bloquer
      let profilePicUrl = 'https://files.catbox.moe/k37u59.png';
      try {
        profilePicUrl = await Promise.race([
          sock.profilePictureUrl(participantJid, 'image'),
          new Promise((_, r) => setTimeout(() => r(new Error('pp_timeout')), 5000))
        ]);
      } catch (_) {}

`;
handler = replaceOnce(handler, oldProfileBlock, '', 'ancien fetch photo supprimé');

const oldWelcomeSend = `        // [PERF] axios.get avec timeout 8s
        try {
          const img = await axios.get(profilePicUrl, { responseType: 'arraybuffer', timeout: 8000 });
          await sock.sendMessage(id, {
            image: Buffer.from(img.data), caption: welcomeMsg, mentions: [participantJid]
          });
        } catch (_) {
          await sock.sendMessage(id, { text: welcomeMsg, mentions: [participantJid] });
        }`;
const newWelcomeSend = `        try {
          await sendGroupEventCard(sock, id, {
            participantJid,
            participant,
            groupMetadata,
            type: 'welcome',
            caption: welcomeMsg,
          });
        } catch (cardErr) {
          console.error('[welcomeCard] accueil échoué:', cardErr.message);
          await sock.sendMessage(id, { text: welcomeMsg, mentions: [participantJid] });
        }`;
handler = replaceOnce(handler, oldWelcomeSend, newWelcomeSend, 'welcome dynamique');

const oldGoodbyeSend = `        // [PERF] axios.get avec timeout 8s
        try {
          const img = await axios.get(profilePicUrl, { responseType: 'arraybuffer', timeout: 8000 });
          await sock.sendMessage(id, {
            image: Buffer.from(img.data), caption: goodbyeMsg, mentions: [participantJid]
          });
        } catch (_) {
          await sock.sendMessage(id, { text: goodbyeMsg, mentions: [participantJid] });
        }`;
const newGoodbyeSend = `        try {
          await sendGroupEventCard(sock, id, {
            participantJid,
            participant,
            groupMetadata,
            type: 'goodbye',
            caption: goodbyeMsg,
          });
        } catch (cardErr) {
          console.error('[welcomeCard] au-revoir échoué:', cardErr.message);
          await sock.sendMessage(id, { text: goodbyeMsg, mentions: [participantJid] });
        }`;
handler = replaceOnce(handler, oldGoodbyeSend, newGoodbyeSend, 'goodbye dynamique');

fs.writeFileSync(handlerPath, handler);

for (const file of [welcomeCardPath, menuPath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[welcome-card] syntaxe invalide ${path.basename(file)}: ${check.stderr || check.stdout}`);
  }
}

// Garde-fou final : la fonction du menu doit accepter le buffer généré tout
// en conservant les timeouts interactifs déjà installés par le patch précédent.
const finalMenu = fs.readFileSync(menuPath, 'utf8');
for (const marker of [
  'imageBuffer: providedImageBuffer = null,',
  'let imageBuffer = providedImageBuffer || null;',
  'if (withImage && !imageBuffer) {',
  '[INTERACTIVE DELIVERY TIMEOUT]',
]) {
  if (!finalMenu.includes(marker)) throw new Error(`[welcome-card] garde-fou menu absent: ${marker}`);
}

console.log('[welcome-card] ✅ cartes dynamiques welcome/goodbye branchées au style actif + CTA chaîne');
