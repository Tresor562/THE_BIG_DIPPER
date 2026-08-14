'use strict';

/**
 * Group activity statistics — THE BIG DIPPER
 * Compatible with the historical getStats/getAllStats API while adding
 * persistent lifetime counters used by .grouplevel.
 */

const fs = require('fs');
const path = require('path');
const { getCurrentSessionId, DEFAULT_SESSION_ID } = require('./sessionContext');

const DB_ROOT = path.join(process.cwd(), 'database');
const SESSIONS_ROOT = path.join(DB_ROOT, 'sessions');
const LEGACY_FILE = path.join(DB_ROOT, 'groupStats.json');
const KEEP_DAYS = 30;
const FLUSH_MS = 2 * 60 * 1000;
const stores = new Map();

function normalizeJid(jid) {
  return String(jid || '').trim();
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sessionFile() {
  const sessionId = getCurrentSessionId();
  const dir = path.join(SESSIONS_ROOT, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'groupStats.json');

  if (!fs.existsSync(file) && sessionId === DEFAULT_SESSION_ID && fs.existsSync(LEGACY_FILE)) {
    try { fs.copyFileSync(LEGACY_FILE, file); } catch (_) {}
  }
  return file;
}

function readStore() {
  const file = sessionFile();
  if (stores.has(file)) return stores.get(file);
  let data = {};
  try {
    if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (_) { data = {}; }
  const state = { file, data, dirty: false, timer: null };
  stores.set(file, state);
  return state;
}

function flushState(state) {
  if (!state?.dirty) return;
  try {
    fs.mkdirSync(path.dirname(state.file), { recursive: true });
    fs.writeFileSync(state.file, JSON.stringify(state.data, null, 2), 'utf8');
    state.dirty = false;
  } catch (err) {
    console.error('[groupstats] write error:', err.message);
  }
}

function markDirty(state) {
  state.dirty = true;
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flushState(state);
  }, FLUSH_MS);
  if (state.timer.unref) state.timer.unref();
}

function isDayKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key));
}

function ensureGroup(state, groupId) {
  const gid = normalizeJid(groupId);
  if (!state.data[gid] || typeof state.data[gid] !== 'object') state.data[gid] = {};
  const group = state.data[gid];

  if (!group.__lifetime || typeof group.__lifetime !== 'object') {
    const lifetime = { total: 0, users: {} };
    for (const [key, day] of Object.entries(group)) {
      if (!isDayKey(key) || !day || typeof day !== 'object') continue;
      lifetime.total += Number(day.total) || 0;
      for (const [jid, count] of Object.entries(day.users || {})) {
        lifetime.users[jid] = (lifetime.users[jid] || 0) + (Number(count) || 0);
      }
    }
    group.__lifetime = lifetime;
    markDirty(state);
  }
  if (!group.__lifetime.users || typeof group.__lifetime.users !== 'object') group.__lifetime.users = {};
  if (!Number.isFinite(group.__lifetime.total)) group.__lifetime.total = 0;
  return group;
}

function purgeOldDays(group) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - KEEP_DAYS);
  const cutoffKey = dateKey(cutoff);
  for (const key of Object.keys(group)) {
    if (isDayKey(key) && key < cutoffKey) delete group[key];
  }
}

function thresholdForLevel(level) {
  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  return lvl <= 1 ? 0 : 20 * Math.pow(lvl - 1, 2);
}

function levelFromMessages(messages) {
  const count = Math.max(0, Number(messages) || 0);
  return Math.floor(Math.sqrt(count / 20)) + 1;
}

function getLevelInfoFromCount(messages) {
  const count = Math.max(0, Number(messages) || 0);
  const level = levelFromMessages(count);
  const currentFloor = thresholdForLevel(level);
  const nextLevelAt = thresholdForLevel(level + 1);
  const span = Math.max(1, nextLevelAt - currentFloor);
  const progress = Math.max(0, Math.min(1, (count - currentFloor) / span));
  return { messages: count, level, currentFloor, nextLevelAt, progress };
}

function addMessage(groupId, senderId) {
  const gid = normalizeJid(groupId);
  const sender = normalizeJid(senderId);
  if (!gid || !sender) return null;

  const state = readStore();
  const group = ensureGroup(state, gid);
  const today = dateKey();
  if (!group[today]) group[today] = { total: 0, users: {}, hours: {} };
  const day = group[today];
  if (!day.users) day.users = {};
  if (!day.hours) day.hours = {};

  day.total = (Number(day.total) || 0) + 1;
  day.users[sender] = (Number(day.users[sender]) || 0) + 1;
  const hour = String(new Date().getHours()).padStart(2, '0');
  day.hours[hour] = (Number(day.hours[hour]) || 0) + 1;

  const previousMessages = Number(group.__lifetime.users[sender]) || 0;
  const previousLevel = levelFromMessages(previousMessages);
  const messages = previousMessages + 1;
  group.__lifetime.users[sender] = messages;
  group.__lifetime.total = (Number(group.__lifetime.total) || 0) + 1;
  purgeOldDays(group);
  markDirty(state);

  const info = getLevelInfoFromCount(messages);
  return {
    groupId: gid,
    sender,
    previousMessages,
    previousLevel,
    ...info,
    leveledUp: info.level > previousLevel,
  };
}

function getStats(groupId) {
  const state = readStore();
  const group = ensureGroup(state, groupId);
  return group[dateKey()] || null;
}

function getAllStats(groupId) {
  const state = readStore();
  const group = ensureGroup(state, groupId);
  const out = {};
  for (const [key, value] of Object.entries(group)) if (isDayKey(key)) out[key] = value;
  return out;
}

function getLifetimeStats(groupId) {
  const state = readStore();
  const group = ensureGroup(state, groupId);
  return {
    total: Number(group.__lifetime.total) || 0,
    users: { ...(group.__lifetime.users || {}) },
  };
}

function getMemberLevel(groupId, senderId) {
  const lifetime = getLifetimeStats(groupId);
  return getLevelInfoFromCount(Number(lifetime.users[normalizeJid(senderId)]) || 0);
}

function getLeaderboard(groupId, limit = 10) {
  const lifetime = getLifetimeStats(groupId);
  return Object.entries(lifetime.users || {})
    .map(([jid, messages]) => ({ jid, ...getLevelInfoFromCount(messages) }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
}

function flushAll() {
  for (const state of stores.values()) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    flushState(state);
  }
}

process.once('exit', flushAll);

module.exports = {
  addMessage,
  getStats,
  getAllStats,
  getLifetimeStats,
  getMemberLevel,
  getLeaderboard,
  levelFromMessages,
  thresholdForLevel,
  getLevelInfoFromCount,
  flushAll,
};
