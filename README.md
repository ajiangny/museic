# Museic — Museum Soundtrack

CS355 Final Project. Pairs each track in your YouTube playlist with artwork from the Art Institute of Chicago.

## APIs Used

- **YouTube Data API v3** (OAuth 2.0 Authorization Code) — fetches user playlists and playlist items
- **Art Institute of Chicago API** (public) — searches artworks by title/keyword

## How It Works

1. Login with your Google account (OAuth 2.0 three-legged flow)
2. Pick a playlist from the dropdown (includes your playlists + Liked Videos)
3. For **each track**, the server searches the AIC using the full track title
4. If no artwork is found, it falls back to a single extracted keyword
5. All AIC searches happen sequentially — one finishes before the next begins
6. Results are displayed as track → artwork pairings

## Setup

1. Create a Google Cloud project and enable the **YouTube Data API v3**
2. Create OAuth 2.0 credentials (type: Web application)
3. Add `http://localhost:8080/callback` as an authorized redirect URI
4. Fill in your `CLIENT_ID` and `CLIENT_SECRET` in `config.js`
5. Run the server:

```bash
node server.js
```

6. Open `http://localhost:8080` in your browser

## File Structure

```
├── server.js           # HTTP server — routes all requests
├── oauth.js            # OAuth 2.0 login, callback, token refresh
├── youtube.js          # YouTube API — playlists + playlistItems
├── artic.js            # AIC search, keyword extraction, per-track pairing
├── cache.js            # In-memory token store + file-based AIC cache (24h TTL)
├── httpClient.js       # Shared HTTPS request helper (callbacks only)
├── views.js            # Dynamic HTML builders (playlist picker, results, error)
├── config.js           # OAuth credentials — DO NOT COMMIT (gitignored)
├── static/
│   ├── style.css       # Base stylesheet
│   ├── landing.html    # Home page (static file, served via fs.readFile)
│   └── 404.html        # 404 page (static file, served via fs.readFile)
├── cache/              # Runtime AIC cache files — delete before submitting
└── README.md
```

## API Call Flow (Four Phases)

```
Phase 1  GET /           → server reads landing.html → sends form to user
Phase 2  POST /search    → user submits playlistId → server calls YouTube playlistItems API (A)
Phase 3  [inside A's callback] → for each track, server calls AIC search API (B) sequentially
Phase 4  [inside B's final callback] → server renders results page → sends to user
```

AIC calls are chained recursively — each one starts only after the previous response is received.

## Caching

| Resource | Storage | TTL | Notes |
|---|---|---|---|
| OAuth access token | In-memory (`tokenStore`) | Until expiry | Auto-refreshed via refresh token |
| AIC search results | File: `cache/aic-{query}.json` | 24 hours | Keyed by search query string |
| YouTube playlists/items | Not cached | — | User-specific, changes frequently |

## Constraints (CS355 Requirements)

- No npm packages — Node core modules only (`http`, `https`, `fs`, `url`, `querystring`, `crypto`, `path`)
- No Promises, `async`/`await`, or `fetch` — callbacks only
- No `setTimeout` in submitted code
- Server makes all API calls — browser only talks to the server
- API A (YouTube) must complete before API B (AIC) begins
