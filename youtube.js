// youtube.js — YouTube Data API v3 interactions
// Fetch user playlists and playlist items using OAuth access tokens.

const querystring = require('querystring');
const { httpsRequest } = require('./httpClient');

function fetchPlaylists(accessToken, callback) {
  const options = {
    hostname: 'www.googleapis.com',
    path: '/youtube/v3/playlists?part=snippet&mine=true&maxResults=25',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  httpsRequest(options, null, (err, res) => {
    if (err) return callback(err);
    if (res.statusCode !== 200) {
      return callback(new Error(`Playlists fetch failed with status ${res.statusCode}: ${res.body}`));
    }
    try {
      const data = JSON.parse(res.body);
      const likedVideos = { id: 'LL', snippet: { title: 'Liked Videos' } };
      data.items = [likedVideos].concat(data.items || []);
      callback(null, data);
    } catch (e) {
      callback(new Error('Failed to parse playlists response'));
    }
  });
}

function fetchPlaylistItems(accessToken, playlistId, callback) {
  const params = querystring.stringify({
    part: 'snippet',
    playlistId,
    maxResults: 10,
  });

  const options = {
    hostname: 'www.googleapis.com',
    path: `/youtube/v3/playlistItems?${params}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  console.log('API 1 called: YouTube playlistItems');

  httpsRequest(options, null, (err, res) => {
    if (err) return callback(err);
    if (res.statusCode !== 200) {
      return callback(new Error(`PlaylistItems fetch failed with status ${res.statusCode}: ${res.body}`));
    }
    try {
      console.log('API 1 response received: YouTube playlistItems');
      callback(null, JSON.parse(res.body));
    } catch (e) {
      callback(new Error('Failed to parse playlistItems response'));
    }
  });
}

module.exports = { fetchPlaylists, fetchPlaylistItems };
