# Deploying Wise Toad (deploy-safe Gemini proxy)

The browser never holds the API key. `index.html` POSTs the conversation to
`/api/chat`, and the serverless function in `api/chat.js` calls Gemini using the
`GEMINI_API_KEY` environment variable. Model: **Gemini 3 Flash** (`gemini-3-flash-preview`).

## 1. Rotate the key first

The key currently in `.env.local` was pasted into a chat — regenerate it in
[Google AI Studio](https://aistudio.google.com/apikey) and revoke the old one.
Put the new value in `.env.local` (local) and your host's env vars (production).

## 2. Run locally

```bash
npm i -g vercel        # one-time
vercel dev             # serves index.html + /api/chat, reads .env.local
```

Open the printed URL (e.g. http://localhost:3000) and talk to the Toad.

## 3. Deploy to Vercel

```bash
vercel                 # first run links/creates the project
vercel --prod          # deploy to production
```

Then set the secret so production has it (the dashboard works too:
Project → Settings → Environment Variables):

```bash
vercel env add GEMINI_API_KEY production
# paste the rotated key when prompted, then redeploy:
vercel --prod
```

No `package.json` or build step is needed — `api/chat.js` uses only the Node 18+
global `fetch`, and `index.html` is served as a static file.

## The living sky (`/api/weather`)

The scene mirrors the visitor's real sky. `GET /api/weather` returns
`{ lat, lon, city, current }`: the location comes from the host's IP geolocation
(Vercel `x-vercel-ip-*` headers, Netlify `context.geo`) or an IP lookup via
geojs.io, and `current` is Open-Meteo's current weather there. Both services are
free and need no key, so there is nothing to configure. Netlify routes it to
`netlify/functions/weather.mjs` (see `netlify.toml`).

If the endpoint is missing (any static host), the page asks geojs.io and
Open-Meteo directly from the browser, so the sky still works; it just costs the
visitor two extra requests.

## Porting to another host

The client only depends on a `POST /api/chat` endpoint that accepts
`{ contents }` and returns `{ reply }`. To move hosts, reimplement that
contract:

- **Netlify:** put the logic in `netlify/functions/chat.js` and add a redirect
  from `/api/chat` to `/.netlify/functions/chat`. Set `GEMINI_API_KEY` in the
  Netlify dashboard.
- **Cloudflare Pages:** put it in `functions/api/chat.js` (Pages Functions use
  `export async function onRequestPost({ request, env })`; read `env.GEMINI_API_KEY`).
  Add the key with `wrangler pages secret put GEMINI_API_KEY`.

## Free tier

Gemini 3 Flash free tier: ~10 req/min, 250K tokens/min, ~1,500 req/day — far more
than this single-toad chat needs.
