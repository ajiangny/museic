/**
 * artic.js — Art Institute of Chicago API interactions
 *
 * Searches the AIC public API for artworks by keyword.
 * Uses file-based caching via cache.js to avoid redundant API calls.
 */

const querystring = require('querystring');
const { httpsRequest } = require('./httpClient');
const { getCached, setCached, AIC_CACHE_TTL } = require('./cache');

// Search the Art Institute of Chicago for artworks matching a query.
// Checks the file cache first; if miss, hits the API and caches the result.
function searchAIC(keyword, callback) {
  getCached(keyword, AIC_CACHE_TTL, (err, cached) => {
    if (cached) {
      console.log(`[Cache] AIC cache hit for: ${keyword}`);
      return callback(null, cached);
    }

    console.log(`API 2 called: AIC search — query: ${keyword}`);

    const searchPath = '/api/v1/artworks/search?' + querystring.stringify({
      q: keyword,
      limit: 5,
      fields: 'id,title,artist_display,image_id',
    });

    const options = {
      hostname: 'api.artic.edu',
      path: searchPath,
      method: 'GET',
      headers: {
        'User-Agent': 'cs355-fp-museum-soundtrack',
      },
    };

    httpsRequest(options, null, (err, res) => {
      if (err) return callback(err);

      try {
        const { data: artworks = [] } = JSON.parse(res.body);

        console.log(`API 2 response received: AIC search — ${artworks.length} results`);

        setCached(keyword, artworks, () => callback(null, artworks));
      } catch (e) {
        callback(new Error('Failed to parse AIC response'));
      }
    });
  });
}

// Extract a meaningful keyword from a YouTube video title.
// Strategy:
//   1. Strip parenthetical noise: "(Official Video)", "[Lyrics]", etc.
//   2. Look for a common "Artist - Title" or "Title | Artist" separator.
//   3. Fall back to the longest non-stopword in the title.
function extractKeyword(title) {
  const STOPWORDS = [
    'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'it',
    'and', 'or', 'but', 'with', 'by', 'from', 'up', 'out', 'if', 'about',
    'into', 'through', 'during', 'before', 'after', 'above', 'between',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'because', 'as', 'until', 'while', 'my',
    'your', 'our', 'their', 'its', 'his', 'her', 'this', 'that', 'these',
    'official', 'video', 'audio', 'lyrics', 'lyric', 'music', 'hd', '4k',
    'ft', 'feat', 'featuring', 'remix', 'live', 'cover', 'version',
    'mv', 'visualizer', 'performance', 'acoustic', 'extended',
    'mix', 'beat', 'beats', 'loop', 'instrumental', 'piano', 'guitar',
    'slowed', 'reverb', 'nightcore', 'sped', 'full', 'album', 'ep',
    'playlist', 'compilation', 'best', 'greatest', 'hits',
    'new', 'song', 'track', 'sound', 'study', 'sleep', 'relax',
    'chill', 'vibes', 'lofi', 'lo', 'fi', 'hour', 'hours',
  ];

  const isStopword = (word) => STOPWORDS.indexOf(word.toLowerCase()) !== -1;

  const cleanSegment = (segment) => segment
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[\w\u00C0-\u017F]+-[\w\u00C0-\u017F]+/g, m => m.replace(/-/g, ''))
    .replace(/[^\w\u00C0-\u017F\s]/g, ' ')
    .trim();

  const bestWordFrom = (text) => {
    const words = cleanSegment(text).split(/\s+/).filter(w =>
      w.length >= 3 && !isStopword(w) && !/^\d+$/.test(w)
    );
    if (words.length === 0) return null;
    words.sort((a, b) => b.length - a.length);
    return words[0];
  };

  // Try to split on "Artist - Title" or "Title | Artist"
  const sep = title.match(/^(.+?)\s*[-\u2014|]\s*(.+)$/);
  if (sep) {
    const fromLeft = bestWordFrom(sep[1]);
    const fromRight = bestWordFrom(sep[2]);
    if (fromLeft) return fromLeft;
    if (fromRight) return fromRight;
  }

  const fallback = bestWordFrom(title);
  if (fallback) return fallback;

  return title.trim();
}

// Search AIC for artworks for each track title sequentially.
// Fires one AIC request at a time — each call waits for the previous
// response before the next begins (recursive callbacks, no race conditions).
function searchAICForTracks(titles, callback) {
  const pairs = [];

  function step(index) {
    if (index >= titles.length) {
      return callback(null, pairs);
    }

    const fullQuery = titles[index]
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`API 2 called: AIC search ${index + 1}/${titles.length} (full title) — query: ${fullQuery}`);

    searchAIC(fullQuery, (err, artworks) => {
      // If full-title search returned nothing, retry with a single keyword
      if (!err && (!artworks || artworks.length === 0)) {
        const keyword = extractKeyword(titles[index]);
        console.log(`API 2 called: AIC fallback search — keyword: ${keyword}`);

        searchAIC(keyword, (fallbackErr, fallbackArtworks) => {
          pairs.push({
            title: titles[index],
            keyword,
            artworks: fallbackErr ? [] : (fallbackArtworks || []),
          });
          step(index + 1);
        });
        return;
      }

      pairs.push({
        title: titles[index],
        keyword: fullQuery,
        artworks: err ? [] : artworks,
      });
      step(index + 1);
    });
  }

  step(0);
}

module.exports = { searchAIC, searchAICForTracks, extractKeyword };
