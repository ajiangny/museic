/**
 * cache.js — In-memory token store + file-based AIC cache
 *
 * Token store: single-user in-memory cache for OAuth access/refresh tokens.
 * AIC cache: file-based with configurable TTL (default 24h).
 */

const fs = require('fs');
const path = require('path');

// ── In-memory token store ──────────────────────────────────────────
var tokenStore = {
  access_token: null,
  refresh_token: null,
  expires_at: null, // Date.now() + expires_in * 1000
};

// ── CSRF state store ───────────────────────────────────────────────
var stateStore = new Map(); // state string -> timestamp

// ── File-based AIC cache ───────────────────────────────────────────

var CACHE_DIR = path.join(__dirname, 'cache');
var AIC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

/**
 * Retrieve a cached AIC result by keyword.
 * @param {string} key     - The search keyword
 * @param {number} ttlMs   - Time-to-live in milliseconds
 * @param {function} callback - callback(err, data|null)
 */
function getCached(key, ttlMs, callback) {
  var file = path.join(CACHE_DIR, 'aic-' + key + '.json');
  fs.stat(file, function (err, stat) {
    if (err) return callback(null, null); // cache miss
    if (Date.now() - stat.mtimeMs > ttlMs) return callback(null, null); // expired
    fs.readFile(file, 'utf8', function (err, data) {
      if (err) return callback(null, null);
      try {
        callback(null, JSON.parse(data));
      } catch (e) {
        callback(null, null);
      }
    });
  });
}

/**
 * Store an AIC result in the file cache.
 * @param {string} key  - The search keyword
 * @param {*} data       - Data to cache (will be JSON-stringified)
 * @param {function} [callback] - optional callback()
 */
function setCached(key, data, callback) {
  var file = path.join(CACHE_DIR, 'aic-' + key + '.json');
  fs.mkdir(CACHE_DIR, { recursive: true }, function () {
    fs.writeFile(file, JSON.stringify(data), function () {
      if (callback) callback();
    });
  });
}

module.exports = {
  tokenStore: tokenStore,
  stateStore: stateStore,
  getCached: getCached,
  setCached: setCached,
  AIC_CACHE_TTL: AIC_CACHE_TTL,
};
