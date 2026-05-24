// server.js — Main entry point
// HTTP server that routes requests to the appropriate handler.
// No npm packages — Node core modules only.

const http = require('http');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const oauth = require('./oauth');
const youtube = require('./youtube');
const artic = require('./artic');
const views = require('./views');

const server = http.createServer();

server.on("request", request_handler);

function request_handler(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;
  const query = Object.fromEntries(parsed.searchParams);

  console.log(`${req.method} ${pathname}`);

  // GET /
  if (req.method === 'GET' && pathname === '/') {
    const form = fs.createReadStream(path.join(__dirname, 'static', 'landing.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    form.pipe(res);
    return;
  }

  // GET /login
  if (req.method === 'GET' && pathname === '/login') {
    oauth.handleLogin(req, res);
    return;
  }

  // GET /callback
  if (req.method === 'GET' && pathname === '/callback') {
    oauth.handleCallback(query, req, res);
    return;
  }

  // GET /search (wrong method)
  if (req.method === 'GET' && pathname === '/search') {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(views.errorPage('This endpoint only accepts POST requests.'));
    return;
  }

  // POST /search
  if (req.method === 'POST' && pathname === '/search') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      const { playlistId } = querystring.parse(body);

      if (!playlistId || !/^(PL[A-Za-z0-9_-]+|LL|WL|FL)$/.test(playlistId)) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(views.errorPage('Invalid or missing playlist ID.'));
        return;
      }

      oauth.ensureValidToken((err, accessToken) => {
        if (err) {
          res.writeHead(302, { Location: '/login' }).end();
          return;
        }

        console.log('API 1 called: YouTube playlistItems');
        youtube.fetchPlaylistItems(accessToken, playlistId, (err, data) => {
          if (err) {
            if (err.message && err.message.indexOf('401') !== -1) {
              oauth.refreshAccessToken((refreshErr, newToken) => {
                if (refreshErr) {
                  res.writeHead(302, { Location: '/login' }).end();
                  return;
                }
                youtube.fetchPlaylistItems(newToken, playlistId, (retryErr, retryData) => {
                  if (retryErr) {
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(views.errorPage(`Failed to fetch playlist items: ${retryErr.message}`));
                    return;
                  }
                  console.log('API 1 response received: YouTube playlistItems');
                  handle_playlist_items_response(retryData, res);
                });
              });
              return;
            }

            if (err.message && (err.message.indexOf('404') !== -1 || err.message.indexOf('403') !== -1)) {
              res.writeHead(404, { 'Content-Type': 'text/html' });
              res.end(views.errorPage('Playlist not found or access denied. It may be private or deleted.'));
              return;
            }

            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(views.errorPage(`Failed to fetch playlist items: ${err.message}`));
            return;
          }

          console.log('API 1 response received: YouTube playlistItems');
          handle_playlist_items_response(data, res);
        });
      });
    });
    return;
  }

  // GET /static/*
  if (req.method === 'GET' && pathname.startsWith('/static/')) {
    const safeName = path.basename(pathname);
    const filePath = path.join(__dirname, 'static', safeName);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(safeName);
      const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  // Catch-all 404
  not_found(res);
}

function not_found(res) {
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('<h1>404 Not Found</h1>');
}

function handle_playlist_items_response(data, res) {
  if (!data.items || data.items.length === 0) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(views.errorPage('This playlist has no items.'));
    return;
  }

  const titles = data.items.map(item => item.snippet.title);

  artic.searchAICForTracks(titles, (err, pairs) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(views.errorPage(`Art search failed: ${err.message}`));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(views.resultsPage(pairs));
  });
}

server.on("listening", () => {
  console.log(`Museic server running at http://localhost:${config.PORT}`);
});
server.listen(config.PORT);
