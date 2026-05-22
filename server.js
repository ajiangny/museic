/**
 * server.js — Main entry point
 *
 * HTTP server that routes requests to the appropriate handler.
 * Pattern matches on req.method + req.url in an if/else chain.
 * No npm packages — Node core modules only.
 */

var http = require('http');
var url = require('url');
var querystring = require('querystring');
var fs = require('fs');
var path = require('path');

var config = require('./config');
var oauth = require('./oauth');
var youtube = require('./youtube');
var artic = require('./artic');
var views = require('./views');
var cache = require('./cache');

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname;
  var query = parsed.query;

  console.log(req.method + ' ' + pathname);

  // ── GET / ─────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/') {
    fs.readFile(path.join(__dirname, 'static', 'landing.html'), function (err, data) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Could not load landing page.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // ── GET /login ────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/login') {
    oauth.handleLogin(req, res);
    return;
  }

  // ── GET /callback ─────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/callback') {
    oauth.handleCallback(query, req, res);
    return;
  }

  // ── GET /search (wrong method) ────────────────────────────────
  if (req.method === 'GET' && pathname === '/search') {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(views.errorPage('This endpoint only accepts POST requests.'));
    return;
  }

  // ── POST /search ──────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/search') {
    var body = '';
    req.on('data', function (chunk) {
      body += chunk;
      // Guard against oversized bodies (1MB limit)
      if (body.length > 1e6) {
        req.destroy();
      }
    });
    req.on('end', function () {
      var formData = querystring.parse(body);
      var playlistId = formData.playlistId;

      // Validate playlistId — accept PL* playlists and YouTube's built-in ones (LL, WL, FL)
      if (!playlistId || !/^(PL[A-Za-z0-9_-]+|LL|WL|FL)$/.test(playlistId)) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(views.errorPage('Invalid or missing playlist ID.'));
        return;
      }

      // Ensure we have a valid token
      oauth.ensureValidToken(function (err, accessToken) {
        if (err) {
          // Not authenticated — redirect to login
          res.writeHead(302, { Location: '/login' });
          res.end();
          return;
        }

        // Phase 2: Fire YouTube playlistItems (API call A)
        console.log('API 1 called: YouTube playlistItems');
        youtube.fetchPlaylistItems(accessToken, playlistId, function (err, data) {
          if (err) {
            // If 401, try refresh once then retry
            if (err.message && err.message.indexOf('401') !== -1) {
              oauth.refreshAccessToken(function (refreshErr, newToken) {
                if (refreshErr) {
                  res.writeHead(302, { Location: '/login' });
                  res.end();
                  return;
                }
                youtube.fetchPlaylistItems(newToken, playlistId, function (retryErr, retryData) {
                  if (retryErr) {
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(views.errorPage('Failed to fetch playlist items: ' + retryErr.message));
                    return;
                  }
                  console.log('API 1 response received: YouTube playlistItems');
                  handlePlaylistItemsResponse(retryData, res);
                });
              });
              return;
            }

            // Check for playlist-not-found or forbidden
            if (err.message && (err.message.indexOf('404') !== -1 || err.message.indexOf('403') !== -1)) {
              res.writeHead(404, { 'Content-Type': 'text/html' });
              res.end(views.errorPage('Playlist not found or access denied. It may be private or deleted.'));
              return;
            }

            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(views.errorPage('Failed to fetch playlist items: ' + err.message));
            return;
          }

          console.log('API 1 response received: YouTube playlistItems');
          // Phase 3: Process YouTube response, fire AIC (API call B)
          handlePlaylistItemsResponse(data, res);
        });
      });
    });
    return;
  }

  // ── GET /static/* ──────────────────────────────────────────────
  if (req.method === 'GET' && pathname.indexOf('/static/') === 0) {
    var safeName = path.basename(pathname);
    var filePath = path.join(__dirname, 'static', safeName);
    fs.readFile(filePath, function (err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      var ext = path.extname(safeName);
      var mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' };
      var mime = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  // ── Catch-all 404 ─────────────────────────────────────────────
  fs.readFile(path.join(__dirname, 'static', '404.html'), function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

/**
 * Phase 3 & 4: For each track, search AIC sequentially, then render.
 */
function handlePlaylistItemsResponse(data, res) {
  if (!data.items || data.items.length === 0) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(views.errorPage('This playlist has no items.'));
    return;
  }

  var titles = data.items.map(function (item) {
    return item.snippet.title;
  });

  // Phase 3: For each track, fire AIC sequentially — INSIDE the YouTube callback.
  // searchAICForTracks uses recursive callbacks so each AIC call finishes
  // before the next begins. No race conditions, no async/await.
  artic.searchAICForTracks(titles, function (err, pairs) {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(views.errorPage('Art search failed: ' + err.message));
      return;
    }

    // Phase 4: Render results — one artwork set per track
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(views.resultsPage(pairs));
  });
}

// ── Start server ──────────────────────────────────────────────────
server.listen(config.PORT, function () {
  console.log('Museic server running at http://localhost:' + config.PORT);
});
