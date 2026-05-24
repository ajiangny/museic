// oauth.js — OAuth 2.0 Authorization Code flow handlers
// Handles /login (redirect to Google) and /callback (token exchange).

const crypto = require('crypto');
const querystring = require('querystring');

const config = require('./config');
const { httpsRequest } = require('./httpClient');
const { tokenStore, stateStore } = require('./cache');
const { fetchPlaylists } = require('./youtube');
const views = require('./views');

// GET /login — Generate CSRF state, redirect to Google OAuth.
function handleLogin(req, res) {
  const state = crypto.randomBytes(20).toString('hex');
  stateStore.set(state, Date.now());

  const params = querystring.stringify({
    client_id: config.CLIENT_ID,
    redirect_uri: config.REDIRECT_URI,
    response_type: 'code',
    scope: config.SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  res.writeHead(302, { Location: authorizeUrl }).end();
}

// GET /callback — Exchange authorization code for tokens,
// then fetch playlists and render the picker form.
function handleCallback(parsedQuery, req, res) {
  const { code, state } = parsedQuery;

  if (!code || !state) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(views.errorPage('Missing authorization code or state parameter.'));
    return;
  }

  if (!stateStore.has(state)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end(views.errorPage('Invalid or expired state parameter. Possible CSRF attack.'));
    return;
  }

  stateStore.delete(state);

  exchangeCodeForToken(code, (err, tokens) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(views.errorPage(`Token exchange failed: ${err.message}`));
      return;
    }

    tokenStore.access_token = tokens.access_token;
    tokenStore.refresh_token = tokens.refresh_token || tokenStore.refresh_token;
    tokenStore.expires_at = Date.now() + tokens.expires_in * 1000;

    fetchPlaylists(tokenStore.access_token, (err, playlistData) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(views.errorPage(`Failed to fetch playlists: ${err.message}`));
        return;
      }

      const playlists = playlistData.items || [];
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(views.playlistPickerPage(playlists));
    });
  });
}

// Exchange an authorization code for access + refresh tokens.
function exchangeCodeForToken(code, callback) {
  const post_data = querystring.stringify({
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.REDIRECT_URI,
  });

  const options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(post_data),
    },
  };

  httpsRequest(options, post_data, (err, response) => {
    if (err) return callback(err);
    if (response.statusCode !== 200) {
      return callback(new Error(`Token exchange failed with status ${response.statusCode}: ${response.body}`));
    }
    try {
      const tokens = JSON.parse(response.body);
      callback(null, tokens);
    } catch (e) {
      callback(new Error('Failed to parse token response'));
    }
  });
}

// Refresh the access token using the stored refresh token.
function refreshAccessToken(callback) {
  if (!tokenStore.refresh_token) {
    return callback(new Error('No refresh token available'));
  }

  const post_data = querystring.stringify({
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    refresh_token: tokenStore.refresh_token,
    grant_type: 'refresh_token',
  });

  const options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(post_data),
    },
  };

  httpsRequest(options, post_data, (err, response) => {
    if (err) return callback(err);
    try {
      const tokens = JSON.parse(response.body);
      tokenStore.access_token = tokens.access_token;
      tokenStore.expires_at = Date.now() + tokens.expires_in * 1000;
      callback(null, tokens.access_token);
    } catch (e) {
      callback(new Error('Failed to parse refresh token response'));
    }
  });
}

// Ensure we have a valid access token. If expired, refresh first.
function ensureValidToken(callback) {
  if (!tokenStore.access_token) {
    return callback(new Error('Not authenticated'));
  }
  if (tokenStore.expires_at && Date.now() >= tokenStore.expires_at) {
    refreshAccessToken(callback);
  } else {
    callback(null, tokenStore.access_token);
  }
}

module.exports = { handleLogin, handleCallback, refreshAccessToken, ensureValidToken };
