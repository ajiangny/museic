/**
 * oauth.js — OAuth 2.0 Authorization Code flow handlers
 *
 * Handles /login (redirect to Google) and /callback (token exchange).
 * After successful token exchange, fetches user playlists and renders
 * the playlist picker form.
 */

const crypto = require('crypto');
const querystring = require('querystring');

const config = require('./config');
const { httpsRequest } = require('./httpClient');
const { tokenStore, stateStore } = require('./cache');
const { fetchPlaylists } = require('./youtube');
const views = require('./views');

/**
 * GET /login — Generate CSRF state, redirect to Google OAuth.
 */
function handleLogin(req, res) {
  var state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, Date.now());

  var params = querystring.stringify({
    client_id: config.CLIENT_ID,
    redirect_uri: config.REDIRECT_URI,
    response_type: 'code',
    scope: config.SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: state,
  });

  var authorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + params;

  res.writeHead(302, { Location: authorizeUrl });
  res.end();
}

/**
 * GET /callback — Exchange authorization code for tokens,
 * then fetch playlists and render the picker form.
 */
function handleCallback(parsedQuery, req, res) {
  var code = parsedQuery.code;
  var state = parsedQuery.state;

  // Validate presence of code and state
  if (!code || !state) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(views.errorPage('Missing authorization code or state parameter.'));
    return;
  }

  // Verify CSRF state
  if (!stateStore.has(state)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end(views.errorPage('Invalid or expired state parameter. Possible CSRF attack.'));
    return;
  }

  // Delete state — one-time use
  stateStore.delete(state);

  // Exchange code for tokens
  exchangeCodeForToken(code, function (err, tokens) {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(views.errorPage('Token exchange failed: ' + err.message));
      return;
    }

    // Store tokens
    tokenStore.access_token = tokens.access_token;
    tokenStore.refresh_token = tokens.refresh_token || tokenStore.refresh_token;
    tokenStore.expires_at = Date.now() + tokens.expires_in * 1000;

    // Fetch playlists inside the token callback
    fetchPlaylists(tokenStore.access_token, function (err, playlistData) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(views.errorPage('Failed to fetch playlists: ' + err.message));
        return;
      }

      var playlists = playlistData.items || [];
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(views.playlistPickerPage(playlists));
    });
  });
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
function exchangeCodeForToken(code, callback) {
  var postBody = querystring.stringify({
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: config.REDIRECT_URI,
  });

  var options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postBody),
    },
  };

  httpsRequest(options, postBody, function (err, response) {
    if (err) return callback(err);
    if (response.statusCode !== 200) {
      return callback(new Error('Token exchange failed with status ' + response.statusCode + ': ' + response.body));
    }
    try {
      var tokens = JSON.parse(response.body);
      callback(null, tokens);
    } catch (e) {
      callback(new Error('Failed to parse token response'));
    }
  });
}

/**
 * Refresh the access token using the stored refresh token.
 */
function refreshAccessToken(callback) {
  if (!tokenStore.refresh_token) {
    return callback(new Error('No refresh token available'));
  }

  var postBody = querystring.stringify({
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    refresh_token: tokenStore.refresh_token,
    grant_type: 'refresh_token',
  });

  var options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postBody),
    },
  };

  httpsRequest(options, postBody, function (err, response) {
    if (err) return callback(err);
    try {
      var tokens = JSON.parse(response.body);
      tokenStore.access_token = tokens.access_token;
      tokenStore.expires_at = Date.now() + tokens.expires_in * 1000;
      // refresh_token is NOT re-issued; keep the old one
      callback(null, tokens.access_token);
    } catch (e) {
      callback(new Error('Failed to parse refresh token response'));
    }
  });
}

/**
 * Ensure we have a valid access token. If expired, refresh first.
 * @param {function} callback - callback(err, accessToken)
 */
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

module.exports = {
  handleLogin: handleLogin,
  handleCallback: handleCallback,
  refreshAccessToken: refreshAccessToken,
  ensureValidToken: ensureValidToken,
};
