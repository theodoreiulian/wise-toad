# Wise Toad 🐸

A meditating toad sits in a peaceful sunny grassy field under a blue sky. Talk to him — he's wise.

## What it is

An animated pixel-art scene rendered to an HTML5 canvas with a chat interface. The toad replies with deep philosophical wisdom via Gemini AI.

**Features:**
- Swaying grass and wildflowers bobbing in the breeze
- Distant rolling hills, drifting clouds, birds gliding by
- Floating pollen and a soft glowing sun
- Pixel-art speech bubbles with chat memory
- Fullscreen responsive layout (desktop + mobile)

## Run locally

```bash
# Just the scene (no AI replies)
open index.html

# With AI replies
node local-server.js
```

Then open `http://localhost:3000`.

## Deploy

The browser never holds the API key — it's read server-side from `GEMINI_API_KEY`.

### Vercel

```bash
vercel dev          # local
vercel --prod       # deploy
vercel env add GEMINI_API_KEY production
```

### Netlify

Push to Git, connect the repo in Netlify dashboard, add `GEMINI_API_KEY` in Environment Variables. The `netlify.toml` and `netlify/functions/chat.js` handle the rest.

## Tech

- Single `index.html` — the whole scene, CSS, and chat engine in one IIFE
- `api/chat.js` / `netlify/functions/chat.js` — serverless Gemini proxy
- `local-server.js` — local Node server for development
- No build step, no dependencies (Node 18+ global `fetch`)

## Free tier

Gemini 3 Flash free tier covers ~1,500 requests/day — plenty for a personal toad.