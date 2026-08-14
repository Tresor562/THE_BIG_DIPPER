'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const handlerPath = path.join(__dirname, 'bot', 'handler.js');
const MARKER = '[MUTED COMMAND FEEDBACK]';

if (!fs.existsSync(handlerPath)) {
  throw new Error('[command-guarantee-prep] bot/handler.js introuvable');
}

let src = fs.readFileSync(handlerPath, 'utf8');

if (!src.includes(MARKER)) {
  const feedbackBlock = [
    "      if (!isUnmuteCommand(body, config.prefix)) {",
    "        if (isExplicitCommandAttempt(body)) {",
    "          return sendCommandFeedback(sock, from, msg, '🔇 *Le bot est actuellement en mode silencieux dans ce chat.*'); // [MUTED COMMAND FEEDBACK]",
    "        }",
    "        return;",
    "      }",
  ].join('\n');

  // Forme historique la plus courante : on ne dépend pas de l'indentation du bloc parent.
  const simpleLine = /(^[ \t]*)if\s*\(\s*!isUnmuteCommand\(body\s*,\s*config\.prefix\)\s*\)\s*return\s*;/m;
  const simpleMatch = src.match(simpleLine);

  if (simpleMatch) {
    const indent = simpleMatch[1] || '      ';
    const replacement = [
      `${indent}if (!isUnmuteCommand(body, config.prefix)) {`,
      `${indent}  if (isExplicitCommandAttempt(body)) {`,
      `${indent}    return sendCommandFeedback(sock, from, msg, '🔇 *Le bot est actuellement en mode silencieux dans ce chat.*'); // [MUTED COMMAND FEEDBACK]`,
      `${indent}  }`,
      `${indent}  return;`,
      `${indent}}`,
    ].join('\n');
    src = src.replace(simpleLine, replacement);
    console.log('[command-guarantee-prep] bloc mute historique normalisé');
  } else {
    // Si un autre patch a déjà réécrit le bloc, on le remplace par une forme canonique.
    const muteBlock = /(^[ \t]*)if\s*\(\s*!isMe\s*&&\s*isMutedContext\(from\)\s*\)\s*\{[\s\S]{0,700}?isUnmuteCommand\(body\s*,\s*config\.prefix\)[\s\S]{0,700}?^[ \t]*\}/m;
    const match = src.match(muteBlock);
    if (match) {
      const indent = match[1] || '    ';
      const canonical = [
        `${indent}if (!isMe && isMutedContext(from)) {`,
        `${indent}  if (!isUnmuteCommand(body, config.prefix)) {`,
        `${indent}    if (isExplicitCommandAttempt(body)) {`,
        `${indent}      return sendCommandFeedback(sock, from, msg, '🔇 *Le bot est actuellement en mode silencieux dans ce chat.*'); // [MUTED COMMAND FEEDBACK]`,
        `${indent}    }`,
        `${indent}    return;`,
        `${indent}  }`,
        `${indent}}`,
      ].join('\n');
      src = src.replace(muteBlock, canonical);
      console.log('[command-guarantee-prep] bloc mute alternatif normalisé');
    } else {
      // Dernier recours : si le filtre mute a disparu, on le recrée avant la détection de groupe.
      const anchor = "    const isGroup   = from.endsWith('@g.us');";
      if (!src.includes(anchor)) {
        throw new Error('[command-guarantee-prep] impossible de localiser la zone de garde mute');
      }
      const canonical = [
        '    // [MUTE COMMAND GUARANTEE FALLBACK]',
        '    if (!isMe && isMutedContext(from)) {',
        '      if (!isUnmuteCommand(body, config.prefix)) {',
        '        if (isExplicitCommandAttempt(body)) {',
        "          return sendCommandFeedback(sock, from, msg, '🔇 *Le bot est actuellement en mode silencieux dans ce chat.*'); // [MUTED COMMAND FEEDBACK]",
        '        }',
        '        return;',
        '      }',
        '    }',
        '',
      ].join('\n');
      src = src.replace(anchor, canonical + anchor);
      console.log('[command-guarantee-prep] garde mute recréée en fallback');
    }
  }

  fs.writeFileSync(handlerPath, src, 'utf8');
}

const final = fs.readFileSync(handlerPath, 'utf8');
if (!final.includes(MARKER)) {
  throw new Error('[command-guarantee-prep] marqueur mute absent après normalisation');
}

const check = spawnSync(process.execPath, ['--check', handlerPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error('[command-guarantee-prep] handler invalide: ' + (check.stderr || check.stdout));
}

console.log('[command-guarantee-prep] ✅ garde mute compatible avec les variantes du handler');
