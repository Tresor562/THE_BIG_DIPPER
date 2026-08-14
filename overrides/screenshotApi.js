'use strict';

/**
 * Screenshot API Manager — THE BIG DIPPER
 * Providers (2026 refresh):
 *   1) ScreenshotMachine when SCREENSHOTMACHINE_KEY is configured
 *   2) Microlink (free endpoint works without key, limited daily quota)
 *   3) Thum.io as a last-resort public fallback
 *
 * Device: mobile | pc | tablet
 */
const axios = require('axios');

const TIMEOUT = 30000;
const MIN_IMAGE_BYTES = 3500;

const DEVICES = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, smDevice: 'phone', smDimension: '480x800' },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true, smDevice: 'tablet', smDimension: '800x1280' },
  pc:     { width: 1440, height: 900, isMobile: false, hasTouch: false, smDevice: 'desktop', smDimension: '1440x900' },
};

function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('URL vide');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try { parsed = new URL(withProtocol); }
  catch { throw new Error('URL invalide'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Protocole non autorisé');
  return parsed.toString();
}

function deviceConfig(device) {
  return DEVICES[device] || DEVICES.mobile;
}

function looksLikeImage(buffer, contentType = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_IMAGE_BYTES) return false;
  if (/^image\//i.test(String(contentType))) return true;
  const b = buffer;
  return (
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (b[0] === 0x89 && b.slice(1, 4).toString() === 'PNG') ||
    b.slice(0, 4).toString() === 'GIF8' ||
    (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP')
  );
}

async function downloadImage(url, options = {}) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: TIMEOUT,
    maxContentLength: 25 * 1024 * 1024,
    maxBodyLength: 25 * 1024 * 1024,
    validateStatus: status => status >= 200 && status < 400,
    ...options,
  });
  const buffer = Buffer.from(res.data || []);
  const contentType = res.headers?.['content-type'] || '';
  if (!looksLikeImage(buffer, contentType)) throw new Error(`réponse non-image (${contentType || 'type inconnu'}, ${buffer.length} octets)`);
  return buffer;
}

async function tryScreenshotMachine(url, device) {
  const key = String(process.env.SCREENSHOTMACHINE_KEY || '').trim();
  if (!key) throw new Error('clé SCREENSHOTMACHINE_KEY absente');
  const cfg = deviceConfig(device);
  return downloadImage('https://api.screenshotmachine.com/', {
    params: {
      key,
      url,
      device: cfg.smDevice,
      dimension: cfg.smDimension,
      format: 'jpg',
      cacheLimit: '0',
      delay: '1500',
      zoom: '100',
    },
  });
}

async function tryMicrolink(url, device) {
  const cfg = deviceConfig(device);
  const headers = {};
  const key = String(process.env.MICROLINK_API_KEY || '').trim();
  if (key) headers['x-api-key'] = key;

  const res = await axios.get('https://api.microlink.io/', {
    timeout: TIMEOUT,
    headers,
    params: {
      url,
      'screenshot.type': 'jpeg',
      'viewport.width': cfg.width,
      'viewport.height': cfg.height,
      'viewport.isMobile': cfg.isMobile,
      'viewport.hasTouch': cfg.hasTouch,
      meta: false,
    },
    validateStatus: status => status >= 200 && status < 500,
  });

  if (res.status >= 400 || res.data?.status !== 'success') {
    const message = res.data?.message || res.data?.data?.message || res.data?.code || `HTTP ${res.status}`;
    throw new Error(`Microlink: ${message}`);
  }
  const imageUrl = res.data?.data?.screenshot?.url;
  if (!imageUrl) throw new Error('Microlink: URL de screenshot absente');
  return downloadImage(imageUrl, { headers });
}

async function tryThumio(url, device) {
  const cfg = deviceConfig(device);
  const outputWidth = device === 'pc' ? 1200 : device === 'tablet' ? 820 : 390;
  const cropHeight = Math.min(Math.max(cfg.height, 600), 1400);
  const endpoint = `https://image.thum.io/get/width/${outputWidth}/crop/${cropHeight}/noanimate/allowJPG/${url}`;
  return downloadImage(endpoint);
}

async function takeScreenshot(input, device = 'mobile') {
  const url = normalizeUrl(input);
  const mode = DEVICES[device] ? device : 'mobile';
  const providers = [
    { name: 'screenshotmachine', fn: () => tryScreenshotMachine(url, mode) },
    { name: 'microlink', fn: () => tryMicrolink(url, mode) },
    { name: 'thumio', fn: () => tryThumio(url, mode) },
  ];

  const errors = [];
  for (const provider of providers) {
    try { return await provider.fn(); }
    catch (err) { errors.push(`[${provider.name}] ${err.message}`); }
  }
  throw new Error(`Screenshot impossible : ${errors.join(' | ')}`);
}

module.exports = { takeScreenshot, normalizeUrl };
