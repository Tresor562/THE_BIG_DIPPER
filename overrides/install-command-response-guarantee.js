'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const MARKER = '[COMMAND RESPONSE GUARANTEE]';
const FEEDBACK_MARKER = '[COMMAND FEEDBACK RETRY]';
const UNKNOWN_MARKER = '[UNKNOWN COMMAND RESPONSE GUARANTEE]';
const SLOW_MARKER = '[COMMAND SLOW ACK]';

if (!fs.existsSync(handlerPath)) throw new Error('[command-guarantee] handler.js introuvable');
let src = fs.readFileSync(handlerPath, 'utf8');

function replaceOnce(search, replacement, label, { optional = false } = {}) {
  const count = src.split(search).length - 1;
  if (count === 0) {
    if (src.includes(replacement) || optional) return false;
    throw new Error(`[command-guarantee] ${label}: ancre absente`);
  }
  if (count !== 1) throw new Error(`[command-guarantee] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  return true;
}

function replaceInRegion(startNeedle, endNeedle, search, replacement, label) {
  const start = src.indexOf(startNeedle);
  const end = start < 0 ? -1 : src.indexOf(endNeedle, start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`[command-guarantee] ${label}: région introuvable`);
  const region = src.slice(start, end);
  const count = region.split(search).length - 1;
  if (count !== 1) throw new Error(`[command-guarantee] ${label}: attendu 1 occurrence dans la région, trouvé ${count}`);
  const nextRegion = region.replace(search, replacement);
  src = src.slice(0, start) + nextRegion + src.slice(end);
}

if (!src.includes(FEEDBACK_MARKER)) {
  const anchor = '// ==========================================\n// buildExtra — [FIX 7] isSuperMe bien propagé';
  if (!src.includes(anchor)) throw new Error('[command-guarantee] ancre buildExtra absente');
  const helper = `// ${FEEDBACK_MARKER}\nasync function sendCommandFeedback(sock, jid, msg, text) {\n  if (!jid || !sock || typeof sock.sendMessage !== 'function') return null;\n  const payload = { text: String(text || '⚠️ Commande reçue.') };\n  const isGroup = String(jid).endsWith('@g.us');\n  const attempts = [isGroup && msg ? { quoted: msg } : undefined, undefined, undefined];\n  let lastError = null;\n  for (let i = 0; i < attempts.length; i++) {\n    if (i > 0) await new Promise(resolve => setTimeout(resolve, i === 1 ? 250 : 750));\n    try {\n      const result = await sock.sendMessage(jid, payload, attempts[i]);\n      if (result) return result;\n    } catch (err) { lastError = err; }\n  }\n  console.error('[command-guarantee] feedback impossible vers ' + jid + ': ' + (lastError?.message || 'échec inconnu'));\n  return null;\n}\n\nfunction isExplicitCommandAttempt(body) {\n  const pfx = String(config.prefix || '.');\n  return typeof body === 'string' && body.trim().startsWith(pfx);\n}\n\n`;
  src = src.replace(anchor, helper + anchor);
}

if (!src.includes('[COMMAND BODY EXTENDED TYPES]')) {
  replaceInRegion(
    '    // ── DÉCODAGE CONTENU',
    '    // ── IDENTITÉ EXPÉDITEUR',
    "        content.videoMessage?.caption || ''\n      );",
    "        content.videoMessage?.caption ||\n        content.documentMessage?.caption ||\n        content.buttonsResponseMessage?.selectedButtonId ||\n        content.listResponseMessage?.singleSelectReply?.selectedRowId ||\n        content.templateButtonReplyMessage?.selectedId || '' // [COMMAND BODY EXTENDED TYPES]\n      );",
    'types supplémentaires body'
  );
}
if (!src.includes('[COMMAND VIEWONCE V2 EXTENSION]')) {
  replaceInRegion(
    'const getMessageContent = (msg) => {',
    '// ==========================================\n// CACHE GROUPE',
    '  if (m.viewOnceMessage)            m = m.viewOnceMessage.message;',
    '  if (m.viewOnceMessage)            m = m.viewOnceMessage.message;\n  if (m.viewOnceMessageV2Extension) m = m.viewOnceMessageV2Extension.message; // [COMMAND VIEWONCE V2 EXTENSION]',
    'viewOnce V2 extension'
  );
}

if (!src.includes('[BANNED COMMAND FEEDBACK]')) {
  replaceOnce(
    '    if (!isMe && !isSudo && !msg.key.fromMe && isBannedUser(sender)) return;',
    "    if (!isMe && !isSudo && !msg.key.fromMe && isBannedUser(sender)) {\n      if (isExplicitCommandAttempt(body)) {\n        return sendCommandFeedback(sock, from, msg, '⛔ *Accès refusé.*\\n\\nCe compte ne peut pas utiliser les commandes du bot.'); // [BANNED COMMAND FEEDBACK]\n      }\n      return;\n    }",
    'ban silencieux'
  );
}
if (!src.includes('[MUTED COMMAND FEEDBACK]')) {
  replaceOnce(
    "    if (!isMe && isMutedContext(from)) {\n      if (!isUnmuteCommand(body, config.prefix)) return;\n    }",
    "    if (!isMe && isMutedContext(from)) {\n      if (!isUnmuteCommand(body, config.prefix)) {\n        if (isExplicitCommandAttempt(body)) {\n          return sendCommandFeedback(sock, from, msg, '🔇 *Le bot est actuellement en mode silencieux dans ce chat.*'); // [MUTED COMMAND FEEDBACK]\n        }\n        return;\n      }\n    }",
    'mute silencieux'
  );
}
if (!src.includes('[SELF MODE COMMAND FEEDBACK]')) {
  replaceOnce(
    "      else if (config.selfMode) {\n        return; // Silence total\n      }",
    "      else if (config.selfMode) {\n        return sendCommandFeedback(sock, from, msg, '🔒 *Le bot est actuellement en mode privé.*\\n\\nCette commande est réservée aux utilisateurs autorisés.'); // [SELF MODE COMMAND FEEDBACK]\n      }",
    'selfMode silencieux', { optional: true }
  );
}

if (!src.includes('[ANTISPAM COMMAND FEEDBACK]')) {
  replaceOnce('          if (estSpam) return;', "          if (estSpam) {\n            if (isCommand) await sendCommandFeedback(sock, from, msg, '🛡️ *Commande bloquée par la protection antispam.*'); // [ANTISPAM COMMAND FEEDBACK]\n            return;\n          }", 'antispam silencieux', { optional: true });
}
if (!src.includes('[PURIFICATION COMMAND FEEDBACK]')) {
  replaceOnce('          if (estMenace) return;', "          if (estMenace) {\n            if (isCommand) await sendCommandFeedback(sock, from, msg, '🛡️ *Commande interrompue par la protection du groupe.*'); // [PURIFICATION COMMAND FEEDBACK]\n            return;\n          }", 'purification silencieuse', { optional: true });
}

if (!src.includes(UNKNOWN_MARKER)) {
  const oldUnknown = `    if (!command) {\n      try {\n        const { handleUnknownCommand } = require('./commands/general_tools/menu');\n        const extraForFuzzy = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);\n        await handleUnknownCommand(sock, msg, extraForFuzzy, commandName, args);\n      } catch (_) {}\n      return; // dans tous les cas (confirmation proposée, suggestions, ou\n              // \"commande inconnue\"), une réponse a déjà été envoyée —\n              // rien à exécuter directement ici (voir règle de sécurité)\n    }`;
  const newUnknown = `    if (!command) {\n      // ${UNKNOWN_MARKER}\n      const unknownTrace = { command: 'unknown:' + commandName, jid: from, responses: 0, sends: 0, relays: 0, pending: 0, failures: 0 };\n      try {\n        const { handleUnknownCommand } = require('./commands/general_tools/menu');\n        const extraForFuzzy = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);\n        if (commandResponseStorage && typeof commandResponseStorage.run === 'function') {\n          await commandResponseStorage.run(unknownTrace, () => handleUnknownCommand(sock, msg, extraForFuzzy, commandName, args));\n        } else {\n          await handleUnknownCommand(sock, msg, extraForFuzzy, commandName, args);\n        }\n      } catch (unknownErr) {\n        console.warn('[command-guarantee] moteur commande inconnue échoué: ' + unknownErr.message);\n      }\n      if (unknownTrace.responses === 0) {\n        await sendCommandFeedback(sock, from, msg, '❓ *Commande inconnue :* ' + (config.prefix || '.') + commandName + '\\n\\nUtilise *' + (config.prefix || '.') + 'menu* pour voir les commandes disponibles.');\n      }\n      return;\n    }`;
  if (!src.includes(oldUnknown)) throw new Error('[command-guarantee] bloc commande inconnue attendu absent');
  src = src.replace(oldUnknown, newUnknown);
}

if (!src.includes(SLOW_MARKER)) {
  const runNeedle = `    await commandResponseStorage.run(\n      commandResponseTrace,\n      () => command.execute(sock, msg, args, extra)\n    );`;
  const runReplacement = `    await commandResponseStorage.run(\n      commandResponseTrace,\n      async () => {\n        // ${SLOW_MARKER}\n        const slowAckTimer = setTimeout(() => {\n          if (commandResponseTrace.responses === 0 && commandResponseTrace.pending === 0) {\n            sendCommandFeedback(sock, from, msg, '⏳ *' + (command.name || commandName) + '* est en cours…').catch(() => {});\n          }\n        }, 5000);\n        if (slowAckTimer.unref) slowAckTimer.unref();\n        try { return await command.execute(sock, msg, args, extra); }\n        finally { clearTimeout(slowAckTimer); }\n      }\n    );`;
  if (!src.includes(runNeedle)) throw new Error('[command-guarantee] watchdog commandResponseStorage absent; install-response-style doit passer avant');
  src = src.replace(runNeedle, runReplacement);
}

src = src.replace('    if (commandResponseTrace.responses === 0 && command.noReply !== true) {', '    if (commandResponseTrace.responses === 0) { // [NO SILENT noReply]');

if (!src.includes('const errText = errMsgs[')) {
  const anchor = '    const destJid   = msg?.key?.remoteJid;';
  if (!src.includes(anchor)) throw new Error('[command-guarantee] ancre errText absente');
  src = src.replace(anchor, "    const errText = errMsgs[Math.floor(Math.random() * errMsgs.length)]; // [COMMAND ERROR TEXT GUARANTEE]\n" + anchor);
}
if (!src.includes('[RATE LIMIT COMMAND FEEDBACK]')) {
  replaceOnce("    if (error.message?.includes('rate-overlimit')) return;", "    if (error.message?.includes('rate-overlimit')) {\n      const rateJid = msg?.key?.remoteJid;\n      if (rateJid) {\n        await new Promise(resolve => setTimeout(resolve, 1200));\n        await sendCommandFeedback(sock, rateJid, msg, '⏳ *WhatsApp limite temporairement les envois.*\\n\\nLa commande a bien été reçue, réessaie dans quelques secondes.'); // [RATE LIMIT COMMAND FEEDBACK]\n      }\n      return;\n    }", 'rate-limit silencieux', { optional: true });
}

if (!src.includes(MARKER)) src = src.replace('/**\n * 𝐃𝐈𝐏𝐏𝐄𝐑 Handler', `/**\n * ${MARKER}\n * 𝐃𝐈𝐏𝐏𝐄𝐑 Handler`);

fs.writeFileSync(handlerPath, src, 'utf8');
const check = spawnSync(process.execPath, ['--check', handlerPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[command-guarantee] syntaxe invalide handler.js: ' + (check.stderr || check.stdout));

const final = fs.readFileSync(handlerPath, 'utf8');
for (const required of [MARKER, FEEDBACK_MARKER, UNKNOWN_MARKER, SLOW_MARKER, '[BANNED COMMAND FEEDBACK]', '[MUTED COMMAND FEEDBACK]', '[NO SILENT noReply]', 'sendCommandFeedback(', 'const errText = errMsgs[']) {
  if (!final.includes(required)) throw new Error('[command-guarantee] garde-fou absent: ' + required);
}
if (final.includes('commandResponseTrace.responses === 0 && command.noReply !== true')) throw new Error('[command-guarantee] noReply peut encore créer un silence');

console.log('[command-guarantee] ✅ toute commande explicite reçoit réponse/refus/progression/erreur tant que le socket peut envoyer');
