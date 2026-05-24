/**
 * views.js - dynamic HTML page builders
 * only pages that require injected API data live here.
 * static pages (landing, 404) are served directly from static/*.html.
 * styles live in static/style.css.
 */

//shared helpers
function layout(title, body) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>' + title + '</title>',
    '  <link rel="stylesheet" href="/static/style.css">',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

//Playlist picker (dynamic: needs YouTube playlist data)

function playlistPickerPage(playlists) {
  let options = '';
  for (let i = 0; i < playlists.length; i++) {
    options += '        <option value="' + playlists[i].id + '">'
      + playlists[i].snippet.title + '</option>\n';
  }

  let noResults = playlists.length === 0
    ? '    <p class="no-results">No playlists found on your account.</p>\n'
    : '';

  let body = [
    '  <div class="page">',
    '    <h1>Museic</h1>',
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

// Results page (dynamic: needs YouTube + AIC paired data)

/**
 * @param {Array} pairs - [{ title, keyword, artworks }, ...]
 */
function resultsPage(pairs) {
  let sections = '';

  for (let i = 0; i < pairs.length; i++) {
    let pair = pairs[i];

    // Artwork cards for this track (show up to 3)
    let cards = '';
    let artworks = pair.artworks || [];
    let limit = artworks.length < 3 ? artworks.length : 3;

    if (limit === 0) {
      cards = '        <p class="no-results">No matching artworks found.</p>';
    } else {
      for (let j = 0; j < limit; j++) {
        let art = artworks[j];
        let imgUrl = art.image_id
          ? 'https://www.artic.edu/iiif/2/' + art.image_id + '/full/400,/0/default.jpg'
          : '';

        cards += '        <div class="art-card">\n';
        if (imgUrl) {
          cards += '          <img src="' + imgUrl + '" alt="' + (art.title || 'Artwork') + '" loading="lazy">\n';
        }
        cards += '          <div class="art-info">\n'
          + '            <p class="art-title">' + (art.title || 'Untitled') + '</p>\n'
          + '            <p class="art-artist">' + (art.artist_display || 'Unknown artist') + '</p>\n'
          + '          </div>\n'
          + '        </div>\n';
      }
    }

    sections += [
      '    <div class="track-section">',
      '      <div class="track-header">',
      '        <span class="track-num">' + (i + 1) + '</span>',
      '        <span class="track-title">' + pair.title + '</span>',
      '        <span class="tag">' + pair.keyword + '</span>',
      '      </div>',
      '      <div class="art-grid">',
      cards.trimEnd(),
      '      </div>',
      '    </div>',
      '',
    ].join('\n');
  }

  let body = [
    '  <div class="page">',
    '    <h1>Museic</h1>',
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

// Error page (dynamic: needs error message)

function errorPage(msg) {
  let body = [
    '  <div class="page page-center">',
    '    <div class="error-box">',
    '      <h1>Something went wrong</h1>',
    '      <p>' + msg + '</p>',
    '      <a href="/" class="btn">Back to Home</a>',
    '    </div>',
    '  </div>',
  ].join('\n');

  return layout('Museic \u2014 Error', body);
}

// Exports

module.exports = {
  playlistPickerPage: playlistPickerPage,
  resultsPage: resultsPage,
  errorPage: errorPage,
};
