'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const handlerPath = path.join(BOT, 'handler.js');

if (!fs.existsSync(handlerPath)) {
  throw new Error(`[antilink-fix] fichier absent: ${handlerPath}`);
}

function containsLink(text = '') {
  const normalized = String(text)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\[\s*\.\s*\]|\(\s*\.\s*\)|\{\s*\.\s*\}/g, '.')
    .replace(/\bhxxps:\/\//gi, 'https://')
    .replace(/\bhxxp:\/\//gi, 'http://')
    .trim();

  if (!normalized) return false;

  const patterns = [
    /\b(?:https?|ftp):\/\/[^\s<>"']+/iu,
    /\bwww\.[^\s<>"']+/iu,
    /\b(?:chat\.whatsapp\.com|whatsapp\.com\/channel|wa\.me|t\.me|telegram\.me|discord\.gg|discord\.com\/invite|bit\.ly|tinyurl\.com|cutt\.ly|shorturl\.at|goo\.gl)\/[^\s<>"']+/iu,
    /(?:^|[^\p{L}\p{N}@._-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63}|xn--[\p{L}\p{N}-]{2,59})(?::\d{1,5})?(?:[/?#][^\s<>"']*)?/iu,
    /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d{1,5})?(?:[/?#][^\s<>"']*)?/u,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

// Tests de détection exécutés pendant le build. Ils valident exactement la
// même fonction qui sera injectée dans handler.js.
const mustDetect = [
  'https://example.com/a',
  'www.example.org',
  'google.com/path?q=1',
  'chat.whatsapp.com/ABCDEFG',
  'whatsapp.com/channel/ABCDEFG',
  'wa.me/22912345678',
  't.me/example',
  'discord.gg/example',
  'bit.ly/example',
  'youtu.be/example',
  '192.168.1.1:8080/path',
  '例え.テスト/path',
  'h\u200Bttps://example.com',
  'example[.]com/path',
  'example(.)net',
  'hxxps://example.org',
];
const mustIgnore = [
  'bonjour tout le monde',
  'version 1.2.3',
  'user@example.com',
  'file_name.txt',
  '22912345678',
];

for (const sample of mustDetect) {
  if (!containsLink(sample)) throw new Error(`[antilink-fix] lien non détecté pendant le test: ${sample}`);
}
for (const sample of mustIgnore) {
  if (containsLink(sample)) throw new Error(`[antilink-fix] faux positif pendant le test: ${sample}`);
}

let handler = fs.readFileSync(handlerPath, 'utf8');

const antiStartMarker = '// ==========================================\n// ANTI-LINK';
const antiEndMarker = '// ==========================================\n// AI MODERATOR';
const antiStart = handler.indexOf(antiStartMarker);
const antiEnd = handler.indexOf(antiEndMarker, antiStart + antiStartMarker.length);
if (antiStart < 0 || antiEnd < 0 || antiEnd <= antiStart) {
  throw new Error('[antilink-fix] bloc AntiLink introuvable');
}

if (!handler.includes('[ANTILINK BROAD DETECTION]')) {
  const detectorSource = containsLink.toString();
  const newAntiBlock = `// ==========================================\n// ANTI-LINK\n// [ANTILINK BROAD DETECTION] Détection large + suppression silencieuse.\n// ==========================================\nconst containsLink = ${detectorSource};\n\nconst handleAntilink = async (sock, msg, groupMetadata) => {\n  try {\n    const from   = msg.key.remoteJid;\n    const sender = msg.key.participant || msg.key.remoteJid;\n    const groupSettings = database.getGroupSettings(from);\n    if (!groupSettings.antilink) return false;\n\n    // Utilise le contenu normalisé afin de couvrir aussi view-once / éphémère\n    // et les légendes de documents, sans modifier les autres protections.\n    const content = getMessageContent(msg) || msg.message || {};\n    const body = (\n      content.conversation ||\n      content.extendedTextMessage?.text ||\n      content.imageMessage?.caption ||\n      content.videoMessage?.caption ||\n      content.documentMessage?.caption || ''\n    );\n\n    if (!containsLink(body)) return false;\n\n    // Exemptions existantes conservées à l'identique.\n    if (isAnyOwner(sender) || isSudoUser(sender)) return false;\n    if (await isAdmin(sock, sender, from, groupMetadata)) return false;\n    if (isAllowedUser(sender, groupSettings)) return false;\n\n    const botAdmin = await isBotAdmin(sock, from);\n    const action   = (groupSettings.antilinkAction || 'delete').toLowerCase();\n\n    console.log(\`[antilink] Lien détecté — sender:\${sender} botAdmin:\${botAdmin} action:\${action}\`);\n\n    // Suppression uniquement. Aucun message d'avertissement n'est envoyé.\n    if (botAdmin) {\n      const deleteKey = {\n        remoteJid  : from,\n        id         : msg.key.id,\n        fromMe     : false,\n        participant: sender,\n      };\n      try {\n        await sock.sendMessage(from, { delete: deleteKey });\n        console.log(\`[antilink] ✅ Message supprimé — id:\${msg.key.id}\`);\n      } catch (delErr) {\n        console.error(\`[antilink] ❌ Suppression échouée : \${delErr.message}\`);\n        try {\n          await sock.sendMessage(from, { delete: msg.key });\n          console.log('[antilink] ✅ Message supprimé (fallback clé originale)');\n        } catch (delErr2) {\n          console.error(\`[antilink] ❌ Suppression fallback échouée : \${delErr2.message}\`);\n        }\n      }\n    } else {\n      console.warn('[antilink] ⚠️ Bot pas admin — suppression impossible');\n    }\n\n    // Le mode kick reste compatible, mais sans message avant/après l'expulsion.\n    if (action === 'kick' && botAdmin) {\n      try {\n        await sock.groupParticipantsUpdate(from, [sender], 'remove');\n        console.log(\`[antilink] ✅ Membre expulsé : \${sender}\`);\n      } catch (kickErr) {\n        console.error(\`[antilink] ❌ Expulsion échouée : \${kickErr.message}\`);\n      }\n    }\n\n    // [ANTILINK SILENT HANDLED] Le handler principal s'arrête ici pour ce message.\n    return true;\n  } catch (err) {\n    console.error(\`[antilink] ❌ Erreur globale : \${err.message}\\n\${err.stack}\`);\n    return false;\n  }\n};\n\n`;

  handler = handler.slice(0, antiStart) + newAntiBlock + handler.slice(antiEnd);
}

const oldCall = "      if (groupSettings.antilink && !msg.key.fromMe && _hasText) await handleAntilink(sock, msg, groupMetadata);";
const newCall = `      if (groupSettings.antilink && !msg.key.fromMe) {\n        const linkHandled = await handleAntilink(sock, msg, groupMetadata);\n        if (linkHandled) return; // [ANTILINK SILENT HANDLED]\n      }`;
if (!handler.includes('const linkHandled = await handleAntilink(sock, msg, groupMetadata);')) {
  const count = handler.split(oldCall).length - 1;
  if (count !== 1) {
    throw new Error(`[antilink-fix] appel AntiLink attendu exactement 1 fois, trouvé ${count}`);
  }
  handler = handler.replace(oldCall, newCall);
}

fs.writeFileSync(handlerPath, handler);

// Garde-fous structurels : le build échoue si un futur patch réintroduit
// l'avertissement ou l'ancien détecteur limité.
const finalHandler = fs.readFileSync(handlerPath, 'utf8');
const finalAntiStart = finalHandler.indexOf(antiStartMarker);
const finalAntiEnd = finalHandler.indexOf(antiEndMarker, finalAntiStart + antiStartMarker.length);
const finalAntiBlock = finalHandler.slice(finalAntiStart, finalAntiEnd);

for (const marker of [
  '[ANTILINK BROAD DETECTION]',
  '[ANTILINK SILENT HANDLED]',
  'content.documentMessage?.caption',
  'return true;',
]) {
  if (!finalHandler.includes(marker)) throw new Error(`[antilink-fix] garde manquant: ${marker}`);
}

if (finalAntiBlock.includes('const linkPattern =')) {
  throw new Error('[antilink-fix] ancien linkPattern encore présent');
}
if (finalAntiBlock.includes('les liens ne sont pas autorisés') || finalAntiBlock.includes('antilinkMsg')) {
  throw new Error('[antilink-fix] message d’avertissement AntiLink encore présent');
}
if (!finalHandler.includes('if (linkHandled) return;')) {
  throw new Error('[antilink-fix] le handler principal ne s’arrête pas après suppression');
}

const syntax = spawnSync(process.execPath, ['--check', handlerPath], { encoding: 'utf8' });
if (syntax.status !== 0) {
  throw new Error(`[antilink-fix] syntaxe handler invalide: ${syntax.stderr || syntax.stdout}`);
}

console.log('[antilink-fix] OK — liens larges détectés, suppression silencieuse, kick conservé, handler stoppé après traitement');
