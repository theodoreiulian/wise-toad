# Wise Toad 🐸

A meditating toad sits in a moonlit grassy field under a starlit night sky. Talk to him — he's wise.

**Try it live → [wise-toad.netlify.app](https://wise-toad.netlify.app)**

## What it is

An animated pixel-art scene rendered to an HTML5 canvas with a chat interface. The toad replies with deep philosophical wisdom powered by Gemini AI with Google Search grounding.

**Features:**
- Night-only scene — crescent moon, twinkling stars, fireflies
- Swaying grass and wildflowers bobbing in the breeze
- Distant rolling hills, drifting clouds, silhouetted trees
- Floating pollen motes and a soft moonlight ambient wash
- Pixel-art speech bubbles with conversational memory
- Scroll-back through previous exchanges
- Responsive layout — fullscreen desktop + dedicated mobile chat UI
- No build step, no dependencies (Node 18+ global `fetch`)

## Run locally

```bash
# Just the scene (no AI replies)
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
| `netlify/functions/chat.js` | Serverless Gemini proxy (Netlify) |
| `local-server.js` | Local Node dev server with LAN access |

- Single 320×180 internal pixel grid, `image-rendering: pixelated`
- Deterministic RNG (`mulberry(7)`) — same field layout every reload
- Hybrid canvas + DOM chat — pixel-art bubble backgrounds with real selectable text
- Mobile portrait mode uses a separate toad canvas + DOM chat column
- Model: **Gemini 3 Flash** (`gemini-3-flash-preview`) with Google Search grounding

## Free tier

Gemini 3 Flash free tier covers ~1,500 requests/day — plenty for a personal toad.