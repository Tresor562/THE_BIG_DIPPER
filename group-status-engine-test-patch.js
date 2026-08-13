'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const testsDir = path.join(BOT, 'tests');
fs.mkdirSync(testsDir, { recursive: true });
const file = path.join(testsDir, 'group-status-engine.test.js');

const test = `'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../utils/groupStatusEngine');

function mockSock() {
  const calls = [];
  return {
    calls,
    user: { id: '22900000000:1@s.whatsapp.net' },
    waUploadToServer: async () => { throw new Error('upload should not run for text test'); },
    async relayMessage(jid, message, options) {
      calls.push({ jid, message, options });
      return options?.messageId || 'ok';
    },
  };
}

test('group status text builds a groupStatusMessageV2 and relays it', async () => {
  const sock = mockSock();
  const result = await engine.sendGroupStatus(
    sock,
    '120363000000000000@g.us',
    { text: 'DIPPER group status test' },
    engine.COLORS.purple,
  );
  assert.equal(result.route, 'relayMessage');
  assert.equal(sock.calls.length, 1);
  assert.equal(sock.calls[0].jid, '120363000000000000@g.us');
  assert.ok(sock.calls[0].options?.messageId);
  assert.ok(sock.calls[0].message?.groupStatusMessageV2, 'groupStatusMessageV2 absent');
  assert.equal(
    sock.calls[0].message.groupStatusMessageV2.message?.extendedTextMessage?.text,
    'DIPPER group status test',
  );
});

test('quoted media detection survives common WhatsApp wrappers', () => {
  const quoted = { imageMessage: { caption: 'x', url: 'https://example.invalid/x' } };
  const direct = { extendedTextMessage: { contextInfo: { quotedMessage: quoted } } };
  const ephemeral = { ephemeralMessage: { message: direct } };
  const viewOnce = { viewOnceMessageV2: { message: direct } };
  assert.deepEqual(engine.findQuoted(direct), quoted);
  assert.deepEqual(engine.findQuoted(ephemeral), quoted);
  assert.deepEqual(engine.findQuoted(viewOnce), quoted);
});

test('all group-status routes load with stable permissions and unique tokens', () => {
  const files = ['groupstatus','gc','gc2','gc3','gc4'];
  const seen = new Set();
  for (const file of files) {
    const cmd = require('../commands/group_management/' + file + '.js');
    assert.equal(typeof cmd.execute, 'function', file + ': execute absent');
    assert.equal(cmd.groupOnly, true, file + ': groupOnly invalide');
    assert.equal(cmd.adminOnly, true, file + ': adminOnly invalide');
    assert.equal(cmd.botAdminNeeded, false, file + ': botAdminNeeded doit être false');
    for (const token of [cmd.name, ...(cmd.aliases || [])]) {
      const key = String(token).toLowerCase();
      assert.ok(!seen.has(key), 'collision token: ' + key);
      seen.add(key);
    }
  }
  for (const token of ['groupstatus','gs','gcstatus','gc','gc2','upswgc','gc3','gcstatus3','groupstatus4','gc4']) {
    assert.ok(seen.has(token), 'route absente: ' + token);
  }
});
`;

fs.writeFileSync(file, test, 'utf8');
const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[group-status-test-patch] syntaxe test: ' + (check.stderr || check.stdout));

// Le wrapper appelle déjà `npm run validate:commands` après l'installation
// des dépendances. On accroche le test à ce point afin qu'il s'exécute contre
// la vraie version Baileys installée, sans ajouter un nouveau maillon fragile
// à la longue commande postinstall du wrapper.
const pkgPath = path.join(BOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const original = String(pkg.scripts?.['validate:commands'] || 'node scripts/validate-commands.js');
const runner = 'node --test tests/group-status-engine.test.js';
if (!original.includes(runner)) {
  pkg.scripts = pkg.scripts || {};
  pkg.scripts['validate:commands'] = runner + ' && ' + original;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}
console.log('[group-status-test-patch] ✅ test group-status branché sur validate:commands');
