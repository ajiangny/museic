/**
 * httpClient.js — Shared HTTPS request helper
 *
 * Used by every module that makes outbound API calls.
 * Collects response body chunks and returns the full body on 'end'.
 * Callback signature: callback(err, { statusCode, headers, body })
 */

const https = require('https');

function process_stream(stream, callback, ...args) {
  let body = "";
  stream.on("data", chunk => body += chunk);
  stream.on("end", () => callback(body, ...args));
}

function httpsRequest(options, postBody, callback) {
  const req = https.request(options, (res) => {
    process_stream(res, (body) => {
      callback(null, { statusCode: res.statusCode, headers: res.headers, body });
    });
  });

  req.on("error", (err) => callback(err));

  if (postBody) {
    req.write(postBody);
  }
  req.end();
}

module.exports = { httpsRequest };
