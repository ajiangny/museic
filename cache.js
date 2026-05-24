/**
 * cache.js — In-memory token store + file-based AIC cache
 *
 * Token store: single-user in-memory cache for OAuth access/refresh tokens.
 * AIC cache: file-based with configurable TTL (default 24h).
 */

const fs = require('fs');
const path = require('path');

const tokenStore = {
  access_token: null,
  refresh_token: null,
  expires_at: null,
};

const stateStore = new Map();

const CACHE_DIR = path.join(__dirname, 'cache');
const AIC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

function getCached(key, ttlMs, callback) {
  const file = path.join(CACHE_DIR, `aic-${key}.json`);
  fs.stat(file, (err, stat) => {
    if (err) return callback(null, null);
    if (Date.now() - stat.mtimeMs > ttlMs) return callback(null, null);
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) return callback(null, null);
      try {
        callback(null, JSON.parse(data));
      } catch (e) {
        callback(null, null);
      }
    });
  });
}

function setCached(key, data, callback) {
  const file = path.join(CACHE_DIR, `aic-${key}.json`);
  fs.mkdir(CACHE_DIR, { recursive: true }, () => {
    fs.writeFile(file, JSON.stringify(data), () => {
      if (callback) callback();
    });
  });
}

module.exports = { tokenStore, stateStore, getCached, setCached, AIC_CACHE_TTL };
