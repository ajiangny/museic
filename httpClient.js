/**
 * httpClient.js — Shared HTTPS request helper
 *
 * Used by every module that makes outbound API calls.
 * Collects response body chunks and returns the full body on 'end'.
 * Callback signature: callback(err, { statusCode, headers, body })
 */

const https = require('https');

/**
 * Make an HTTPS request.
 * @param {object} options  - Standard Node https.request options (hostname, path, method, headers)
 * @param {string|null} postBody - Request body for POST requests, or null for GET
 * @param {function} callback - callback(err, { statusCode, headers, body })
 */
function httpsRequest(options, postBody, callback) {
  const req = https.request(options, function (res) {
    var body = '';
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function () {
      callback(null, {
        statusCode: res.statusCode,
        headers: res.headers,
        body: body,
      });
    });
  });

  req.on('error', function (err) {
    callback(err);
  });

  if (postBody) {
    req.write(postBody);
  }
  req.end();
}

module.exports = { httpsRequest: httpsRequest };
