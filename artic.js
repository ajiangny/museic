/**
 * artic.js — Art Institute of Chicago API interactions
 *
 * Searches the AIC public API for artworks by keyword.
 * Uses file-based caching via cache.js to avoid redundant API calls.
 */

const querystring = require('querystring');
const { httpsRequest } = require('./httpClient');
const { getCached, setCached, AIC_CACHE_TTL } = require('./cache');

/**
 * Search the Art Institute of Chicago for artworks matching a keyword.
 * Checks the file cache first; if miss, hits the API and caches the result.
 *
 * @param {string} keyword  - Search term
 * @param {function} callback - callback(err, artworksArray)
 */
function searchAIC(keyword, callback) {
  // Check cache first
  getCached(keyword, AIC_CACHE_TTL, function (err, cached) {
    if (cached) {
      console.log('[Cache] AIC cache hit for keyword:', keyword);
      return callback(null, cached);
    }

    console.log('[B] AIC search request firing — keyword:', keyword);

    var searchPath = '/api/v1/artworks/search?' + querystring.stringify({
      q: keyword,
      limit: 5,
      fields: 'id,title,artist_display,image_id',
    });

    var options = {
      hostname: 'api.artic.edu',
      path: searchPath,
      method: 'GET',
      headers: {
        'User-Agent': 'cs355-fp-museum-soundtrack',
      },
    };

    httpsRequest(options, null, function (err, res) {
      if (err) return callback(err);

      try {
        var parsed = JSON.parse(res.body);
        var artworks = parsed.data || [];

        console.log('[B] AIC search response received —', artworks.length, 'results');

        // Cache the results
        setCached(keyword, artworks, function () {
          callback(null, artworks);
        });
      } catch (e) {
        callback(new Error('Failed to parse AIC response'));
      }
    });
  });
}

/**
 * Extract a meaningful keyword from a YouTube video title.
 *
 * Strategy:
 *   1. Strip parenthetical noise: "(Official Video)", "[Lyrics]", etc.
 *   2. Look for a common "Artist - Title" or "Title | Artist" separator.
 *      The artist/composer side usually yields the best AIC results.
 *   3. If no separator found, fall back to the longest non-stopword in
 *      the title — longer words tend to be more specific.
 *
 * Examples:
 *   "Beethoven - Moonlight Sonata (Full)"    -> "Beethoven"
 *   "The Best of Mozart [Full Album]"        -> "Mozart"
 *   "APT. - ROSE & Bruno Mars [MV]"          -> "ROSE"
 *   "Lo-fi Chill Mix | Study Beats"          -> "Study"
 *
 * @param {string} title - A YouTube video title
 * @returns {string}     A search keyword
 */
function extractKeyword(title) {
  var STOPWORDS = [
    // Common English
    'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'it',
    'and', 'or', 'but', 'with', 'by', 'from', 'up', 'out', 'if', 'about',
    'into', 'through', 'during', 'before', 'after', 'above', 'between',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'because', 'as', 'until', 'while', 'my',
    'your', 'our', 'their', 'its', 'his', 'her', 'this', 'that', 'these',
    // YouTube title noise
    'official', 'video', 'audio', 'lyrics', 'lyric', 'music', 'hd', '4k',
    'ft', 'feat', 'featuring', 'remix', 'live', 'cover', 'version',
    'mv', 'visualizer', 'performance', 'acoustic', 'extended',
    // Music-specific noise
    'mix', 'beat', 'beats', 'loop', 'instrumental', 'piano', 'guitar',
    'slowed', 'reverb', 'nightcore', 'sped', 'full', 'album', 'ep',
    'playlist', 'compilation', 'best', 'greatest', 'hits',
    'new', 'song', 'track', 'sound', 'study', 'sleep', 'relax',
    'chill', 'vibes', 'lofi', 'lo', 'fi', 'hour', 'hours',
  ];

  function isStopword(word) {
    return STOPWORDS.indexOf(word.toLowerCase()) !== -1;
  }

  function cleanSegment(segment) {
    return segment
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/[\w\u00C0-\u017F]+-[\w\u00C0-\u017F]+/g, function(m) { return m.replace(/-/g, ''); }) // join hyphenated words
      .replace(/[^\w\u00C0-\u017F\s]/g, ' ')  // keep accented chars, strip other punctuation
      .trim();
  }

  // Return the longest meaningful word from a text segment
  function bestWordFrom(text) {
    var words = cleanSegment(text).split(/\s+/).filter(function (w) {
      return w.length >= 3 && !isStopword(w) && !/^\d+$/.test(w);
    });
    if (words.length === 0) return null;
    words.sort(function (a, b) { return b.length - a.length; });
    return words[0];
  }

  // Step 1: Try to split on "Artist - Title", "Title | Artist", "Artist - Title"
  var sep = title.match(/^(.+?)\s*[-\u2014|]\s*(.+)$/);
  if (sep) {
    var fromLeft  = bestWordFrom(sep[1]);
    var fromRight = bestWordFrom(sep[2]);
    if (fromLeft)  return fromLeft;
    if (fromRight) return fromRight;
  }

  // Step 2: Longest meaningful word from the full title
  var fallback = bestWordFrom(title);
  if (fallback) return fallback;

  // Step 3: Last resort
  return title.trim();
}

module.exports = {
  searchAIC: searchAIC,
  searchAICForTracks: searchAICForTracks,
  extractKeyword: extractKeyword,
};

/**
 * Search AIC for artworks for each track title sequentially.
 * Fires one AIC request at a time — each call waits for the previous
 * response before the next begins (recursive callbacks, no race conditions).
 *
 * The full (cleaned) title is used as the AIC search query rather than a
 * single extracted keyword, giving the search engine more signal to work with.
 *
 * @param {string[]} titles   - Array of track title strings
 * @param {function} callback - callback(err, pairs)
 *   pairs: [{ title, query, artworks }, ...]
 */
function searchAICForTracks(titles, callback) {
  var pairs = [];

  function step(index) {
    if (index >= titles.length) {
      return callback(null, pairs);
    }

    // Strip parenthetical noise but keep the full title as the primary query
    var fullQuery = titles[index]
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    console.log('[B] AIC search ' + (index + 1) + '/' + titles.length + ' (full title) — query:', fullQuery);

    searchAIC(fullQuery, function (err, artworks) {
      // If full-title search returned nothing, retry with a single keyword
      if (!err && (!artworks || artworks.length === 0)) {
        var keyword = extractKeyword(titles[index]);
        console.log('[B] AIC fallback search — keyword:', keyword);

        searchAIC(keyword, function (fallbackErr, fallbackArtworks) {
          pairs.push({
            title: titles[index],
            keyword: keyword,
            artworks: fallbackErr ? [] : (fallbackArtworks || []),
          });
          step(index + 1);
        });
        return;
      }

      // Full-title search succeeded (or errored — don't retry on error)
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
