'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const source = path.join(ROOT, 'overrides', 'ownerProfileImage.js');
const target = path.join(BOT, 'utils', 'ownerProfileImage.js');

if (!fs.existsSync(source)) throw new Error('[owner-profile-image] override absent');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);

const check = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[owner-profile-image] module invalide: ' + (check.stderr || check.stdout));

const image = require(target);
if (!Buffer.isBuffer(image) || image.length < 1000) throw new Error('[owner-profile-image] image embarquée invalide');

console.log(`[owner-profile-image] ✅ photo créateur embarquée (${image.length} octets)`);
