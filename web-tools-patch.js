'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const OVERRIDES = path.join(ROOT, 'overrides');
if (!fs.existsSync(BOT)) throw new Error('[web-tools] bot/ absent');

const FILES = [
  ['screenshotApi.js', 'utils/screenshotApi.js'],
  ['ssweb.js', 'commands/general_tools/ssweb.js'],
  ['sswebpc.js', 'commands/general_tools/sswebpc.js'],
  ['url.js', 'commands/general_tools/url.js'],
];

for (const [name, dest] of FILES) {
  const src = path.join(OVERRIDES, name);
  const target = path.join(BOT, dest);
  if (!fs.existsSync(src)) throw new Error(`[web-tools] override absent: ${src}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(src, target);
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`[web-tools] syntaxe ${dest}: ${result.stderr || result.stdout}`);
  console.log(`[web-tools] ${dest}`);
}

console.log('[web-tools] ✅ ssweb/sstab/sspc/url actualisés');
