/**
 * youtube.js — YouTube Data API v3 interactions
 *
 * Fetch user playlists and playlist items using OAuth access tokens.
 * All calls use the shared httpsRequest helper with callbacks only.
 */

const querystring = require('querystring');
const { httpsRequest } = require('./httpClient');

/**
 * Fetch the authenticated user's playlists.
 * @param {string} accessToken - OAuth2 access token
 * @param {function} callback  - callback(err, playlistsData)
 */
function fetchPlaylists(accessToken, callback) {
  var options = {
    hostname: 'www.googleapis.com',
    path: '/youtube/v3/playlists?part=snippet&mine=true&maxResults=25',
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  };

  httpsRequest(options, null, function (err, res) {
    if (err) return callback(err);
    if (res.statusCode !== 200) {
      return callback(new Error('Playlists fetch failed with status ' + res.statusCode + ': ' + res.body));
    }
    try {
      var data = JSON.parse(res.body);
      // Prepend the "Liked Videos" special playlist (LL is a built-in playlist
      // accessible with youtube.readonly; it is not returned by mine=true).
      var likedVideos = {
        id: 'LL',
        snippet: { title: '\u2764\ufe0f Liked Videos' },
      };
      data.items = [likedVideos].concat(data.items || []);
      callback(null, data);
    } catch (e) {
      callback(new Error('Failed to parse playlists response'));
    }
  });
}

/**
 * Fetch items from a specific playlist.
 * @param {string} accessToken - OAuth2 access token
 * @param {string} playlistId  - YouTube playlist ID (e.g. PLxxxx)
 * @param {function} callback  - callback(err, playlistItemsData)
 */
function fetchPlaylistItems(accessToken, playlistId, callback) {
  var params = querystring.stringify({
    part: 'snippet',
    playlistId: playlistId,
    maxResults: 10,
  });

  var options = {
    hostname: 'www.googleapis.com',
    path: '/youtube/v3/playlistItems?' + params,
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  };

  console.log('[A] YouTube playlistItems request firing');

  httpsRequest(options, null, function (err, res) {
    if (err) return callback(err);
    if (res.statusCode !== 200) {
      return callback(new Error('PlaylistItems fetch failed with status ' + res.statusCode + ': ' + res.body));
    }
    try {
      console.log('[A] YouTube playlistItems response received');
      callback(null, JSON.parse(res.body));
    } catch (e) {
      callback(new Error('Failed to parse playlistItems response'));
    }
  });
}

module.exports = {
  fetchPlaylists: fetchPlaylists,
  fetchPlaylistItems: fetchPlaylistItems,
};
