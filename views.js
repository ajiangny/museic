/**
 * views.js — Dynamic HTML page builders
 *
 * Only pages that require injected API data live here.
 * Static pages (landing, 404) are served directly from static/*.html.
 * Styles live in static/style.css.
 */

/* ── Shared helpers ──────────────────────────────────────── */

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title, body) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>' + escapeHtml(title) + '</title>',
    '  <link rel="stylesheet" href="/static/style.css">',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

/* ── Playlist picker (dynamic: needs YouTube playlist data) ── */

function playlistPickerPage(playlists) {
  var options = '';
  for (var i = 0; i < playlists.length; i++) {
    options += '        <option value="' + escapeHtml(playlists[i].id) + '">'
      + escapeHtml(playlists[i].snippet.title) + '</option>\n';
  }

  var noResults = playlists.length === 0
    ? '    <p class="no-results">No playlists found on your account.</p>\n'
    : '';

  var body = [
    '  <div class="page">',
    '    <h1><span class="logo-icon">&#127925;</span> Museic</h1>',
    '    <h2>Pick a playlist to find matching artwork</h2>',
    '',
    '    <div class="card">',
    '      <form method="POST" action="/search">',
    '        <label for="playlistId">Your YouTube Playlists</label>',
    '        <select name="playlistId" id="playlistId">',
    options.trimEnd(),
    '        </select>',
    '        <button type="submit" class="btn btn-full">Find Matching Art</button>',
    '      </form>',
    '    </div>',
    '',
    noResults,
    '  </div>',
  ].join('\n');

  return layout('Museic \u2014 Pick a Playlist', body);
}

/* ── Results page (dynamic: needs YouTube + AIC paired data) ─ */

/**
 * @param {Array} pairs - [{ title, keyword, artworks }, ...]
 */
function resultsPage(pairs) {
  var sections = '';

  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];

    /* Artwork cards for this track (show up to 3) */
    var cards = '';
    var artworks = pair.artworks || [];
    var limit = artworks.length < 3 ? artworks.length : 3;

    if (limit === 0) {
      cards = '        <p class="no-results">No matching artworks found.</p>';
    } else {
      for (var j = 0; j < limit; j++) {
        var art = artworks[j];
        var imgUrl = art.image_id
          ? 'https://www.artic.edu/iiif/2/' + art.image_id + '/full/400,/0/default.jpg'
          : '';

        cards += '        <div class="art-card">\n';
        if (imgUrl) {
          cards += '          <img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(art.title || 'Artwork') + '" loading="lazy">\n';
        }
        cards += '          <div class="art-info">\n'
          + '            <p class="art-title">' + escapeHtml(art.title || 'Untitled') + '</p>\n'
          + '            <p class="art-artist">' + escapeHtml(art.artist_display || 'Unknown artist') + '</p>\n'
          + '          </div>\n'
          + '        </div>\n';
      }
    }

    sections += [
      '    <div class="track-section">',
      '      <div class="track-header">',
      '        <span class="track-num">' + (i + 1) + '</span>',
      '        <span class="track-title">' + escapeHtml(pair.title) + '</span>',
      '        <span class="tag">' + escapeHtml(pair.keyword) + '</span>',
      '      </div>',
      '      <div class="art-grid">',
      cards.trimEnd(),
      '      </div>',
      '    </div>',
      '',
    ].join('\n');
  }

  var body = [
    '  <div class="page">',
    '    <h1><span class="logo-icon">&#127925;</span> Museic</h1>',
    '    <h2>Your art &amp; music pairing</h2>',
    '',
    sections.trimEnd(),
    '',
    '    <div class="actions">',
    '      <a href="/" class="btn">Start Over</a>',
    '    </div>',
    '  </div>',
  ].join('\n');

  return layout('Museic \u2014 Results', body);
}

/* ── Error page (dynamic: needs error message) ───────────── */

function errorPage(msg) {
  var body = [
    '  <div class="page page-center">',
    '    <div class="error-box">',
    '      <h1>Something went wrong</h1>',
    '      <p>' + escapeHtml(msg) + '</p>',
    '      <a href="/" class="btn">Back to Home</a>',
    '    </div>',
    '  </div>',
  ].join('\n');

  return layout('Museic \u2014 Error', body);
}

/* ── Exports ─────────────────────────────────────────────── */

module.exports = {
  playlistPickerPage: playlistPickerPage,
  resultsPage: resultsPage,
  errorPage: errorPage,
};
