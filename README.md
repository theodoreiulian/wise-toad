# Wise Toad 🐸

A meditating toad sits in a grassy meadow beneath *your* sky — the same time of day and the same weather as wherever you are. Talk to him — he's wise.

**Try it live → [wise-toad.netlify.app](https://wise-toad.netlify.app)**

## What it is

An animated pixel-art scene rendered to an HTML5 canvas with a chat interface. The toad replies with deep philosophical wisdom powered by Gemini AI with Google Search grounding.

**Features:**
- **A living sky that mirrors yours** — the real sun and moon (position and phase) for your location,
  so it's dawn, noon, golden hour, sunset, blue hour or night exactly when it is for you
- **Your real weather** (via [Open-Meteo](https://open-meteo.com)) — clouds, drizzle, rain, sun showers
  with a rainbow, thunderstorms with lightning, snow that blankets the field (and the toad), fog,
  frost, and grass that bends with the actual wind
- Little lives of their own: Milky Way and shooting stars on clear dark nights, fireflies on warm
  nights, birds and butterflies on fair days, dew and dawn mist on humid mornings
- Swaying grass and wildflowers, distant rolling hills, poplars and a fence
- Pixel-art speech bubbles with conversational memory
- Scroll-back through previous exchanges
- Responsive layout — fullscreen desktop + dedicated mobile chat UI
- No build step, no dependencies (Node 18+ global `fetch`)

## Run locally

```bash
# Just the scene (no AI replies) — the sky still follows your time and weather
open index.html

# With AI replies via the local Node server
node local-server.js
# → http://localhost:3000 (also prints your LAN IP for phone testing)
```

Create a `.env.local` file with your key:

```
GEMINI_API_KEY=your_key_here
```

Or, if you have the Vercel CLI:

```bash
vercel dev   # serves index.html + /api/chat, reads .env.local
```

### Preview any sky

Add URL params to see other times and weather (handy for screenshots):

```
?time=19:40              # a local time (today)
?date=2026-06-21         # another day
?timelapse=120           # speed the sky up (sim seconds per real second)
?lat=48.85&lon=2.35      # somewhere else
?weather=clear|partly|cloudy|overcast|fog|drizzle|rain|showers|storm|snow|frost
```

## Deploy

The browser never holds the API key — it's read server-side from the `GEMINI_API_KEY` env var.

### Vercel

```bash
vercel             # link / create the project
vercel --prod      # deploy
vercel env add GEMINI_API_KEY production
```

No `package.json` or build step — `api/chat.js` uses only the Node 18+ global `fetch`, and `index.html` is served as a static file.

### Netlify

Push to Git, connect the repo in the Netlify dashboard, and add `GEMINI_API_KEY` in Environment Variables. The `netlify.toml` and `netlify/functions/chat.js` handle the rest.

### Other hosts

The client only depends on a `POST /api/chat` endpoint that accepts `{ contents }` and returns `{ reply }`. See [DEPLOY.md](DEPLOY.md) for Cloudflare Pages instructions and more details.

## Tech

| File | Purpose |
|---|---|
| `index.html` | The entire scene, CSS, and chat engine in a single IIFE |
| `api/chat.js` | Serverless Gemini proxy (Vercel) |
| `api/weather.js` | Visitor's location + current weather for the living sky (Vercel / local) |
| `netlify/functions/chat.js` | Serverless Gemini proxy (Netlify) |
| `netlify/functions/weather.mjs` | Location + weather (Netlify, uses `context.geo`) |
| `local-server.js` | Local Node dev server with LAN access |

- Single 320×180 internal pixel grid, `image-rendering: pixelated`
- Deterministic RNG (`mulberry(7)`) — same field layout every reload
- Sun/moon positions from a compact SunCalc port; location from the host's IP geolocation (or geojs.io), never a permission prompt
- Hybrid canvas + DOM chat — pixel-art bubble backgrounds with real selectable text
- Mobile portrait mode uses a separate toad canvas + DOM chat column
- Model: **Gemini 3 Flash** (`gemini-3-flash-preview`) with Google Search grounding

## Free tier

Gemini 3 Flash free tier covers ~1,500 requests/day — plenty for a personal toad.