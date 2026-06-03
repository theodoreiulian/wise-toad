# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wise Toad is an animated pixel-art scene: a meditating toad sitting in a peaceful sunny grassy field
under a blue sky (swaying grass, wildflowers, drifting clouds, distant hills, birds, floating pollen),
rendered to an HTML5 canvas, with a chat UI for "speaking to the Toad." The entire scene — markup,
CSS, and the rendering/chat engine — lives in `index.html` inside one IIFE
(`<script>(() => { 'use strict'; ... })()</script>`). The Toad's replies come from Gemini via a
small server-side proxy in `api/chat.js` (see **Backend** below); that proxy is the only other
source file.

## Running

The pixel scene itself needs no build step — open `index.html` directly, or `python3 -m http.server
8000`. But the chat only works when the `/api/chat` proxy is reachable, which means running it
through a serverless host. For local development with replies:

```bash
vercel dev            # serves index.html + /api/chat, reads GEMINI_API_KEY from .env.local
```

See `DEPLOY.md` for full deploy/port instructions. The only external runtime dependency in the
browser is the VT323 Google Font (loaded via `<link>`); the scene renders fine offline minus that
font, but the Toad stays silent without the proxy.

## Coordinate system (read this first)

The whole project thinks in a fixed **320×180 internal pixel grid** (`const W = 320, H = 180`).
The `<canvas>` backing store is locked to that size with `imageSmoothingEnabled = false` and
`image-rendering: pixelated`. `resize()` is a no-op now: the wrapper is `position:fixed; inset:0; width:100vw; height:100vh`, so the scene always stretches edge-to-edge. It never changes W/H. Every drawing call uses
this 320×180 space, so 1 unit = 1 art pixel regardless of screen size.

DOM overlays (`#bubbleText`, `#sentMessage`, `#userInput`, `#sendBtn`) are positioned by converting
grid coordinates to **percentages of W/H** (e.g. `left: (x/W)*100 + '%'`) so they stay glued to the
right canvas pixels at any scale. Font sizes are scaled by `wrapperH / H` for the same reason.

## Architecture

- **`P`** — the color palette (`hillFar`/`hillNear` + the toad's `tD/tM/tL/tB/tE`; most field colours
  are local consts, see below). **`S`** — scene config; after the field redesign only **`S.toad`**
  (the toad's x/y) still matters — the other room objects (`win`/`tv`/`shelf`…) are vestigial.
- **Horizon & field constants** (defined where the old building arrays were): `YH = 96` is the
  horizon (sky above, field below); `SKY_TOP`/`SKY_MID`/`SKY_HZ` and `GR_FAR`/`GR_NEAR` are `[r,g,b]`
  gradient anchors; `GCOLS` (grass) and `FCOLS` (flower colour pairs) are the palettes.
- **Deterministic RNG**: `mulberry(7)` seeds `frand`, which generates the **field layout once** at
  load — `grassB`/`grassF` (background/foreground grass tufts), `flowers`, `cloudsA`/`cloudsT` (main +
  sceneTop clouds), `motes`. Each element stores a position, size, sway `phase`, colour. The seed
  keeps the field identical across reloads — change it to reshuffle grass/flowers/clouds.
- **Draw primitives**: `rv(x,y,w,h,c)` = filled rect, `d(x,y,c)` = single pixel, `lerpC(a,b,t)` =
  rgb gradient lerp (used for the sky & ground gradients), `pxLine` = Bresenham line. (`boxR`/`boxL`
  fake-iso helpers survive but are now unused.)
- **`render()` draws strictly back-to-front** (painter's algorithm). The call order *is* the z-order:
  sky → sun → clouds → birds → hills → field → background grass → flowers → **toad** → foreground
  grass (sways in front of the toad) → ambient (sunlight + motes) → bubbles. Reordering changes
  occlusion. Grass/flowers sway via `A.sway`; the per-blade tip offset grows with `tt*tt` (more bend
  at the tip).
- **Animation loop**: one `requestAnimationFrame(loop)` → `update(dt)` then `render()`. `dt` is
  clamped to 0.06s. All mutable runtime state lives in object **`A`** (`t` time, `sway` wind, `breath`
  toad, and all chat/bubble layout state).

## Chat system (the subtle part)

Bubbles are **hybrid canvas + DOM**: the pixel-art bubble *backgrounds, borders, and tails* are
drawn on the canvas (`drawBubble`, `drawUserBubble`), while the actual *text* is real DOM
(`#bubbleText` = toad's reply, `#sentMessage` = user's sent message, `#userInput` = live input).
`update()` re-syncs every DOM overlay's position/size/font to the canvas geometry on every frame —
canvas shapes and DOM text must be kept in lockstep or they visibly drift apart.

`showText(text)` measures required bubble height by briefly rendering the DOM offscreen
(`getBoundingClientRect`) before animating the bubble open (`A.bubbleTarget = 1`, `A.bubbleFrame`
eases 0→1).

`A.chatState` is a small machine: `IDLE` ↔ `SWIPING_UP`. On send (`dispatchMessage`), the toad's
current bubble is snapshotted into `A.old*`, the user message detaches and "swipes up" to the top
while the toad bubble fades, then a reply appears. Bubble layout in `update()` enforces physics
rules — the sent message **never** gets squashed; instead the toad bubble is height-limited or the
toad is pushed down to avoid overlap — and the articulated tail is wired to the toad's mouth at a
fixed `y = 100`. Touch these constants carefully.

**Only the latest exchange is ever shown live** — each send clears the previous one. A separate,
purely additive **scroll-back system** reuses the same box format for reading past exchanges (see
below); it does not touch any of the live bubble/swipe/positioning logic above.

### Previous exchanges (additive — same boxes, scrolled into view)

A running `transcript` array records every user message and toad reply via `recordMessage(role,
text)` (called from `dispatchMessage` — once for the user turn, once per reply/error). Each entry
gets a hidden DOM text element (`.histMsg`) in `#histLayer` (`z-index:1`, below the live overlays)
and a matching pixel-bubble background drawn on the canvas by `drawHistory()` — the same format as
the live bubbles.

Scroll-back is a **single continuous offset `A.scroll`** (default 0): `update()` eases `A.scroll`
toward `A.scrollTarget`, and the scroll value is added to the `by`/`top` of every live and history
box (canvas `drawBubble`/`drawUserBubble` + DOM `#bubbleText`/`#sentMessage`/`.histMsg`). The
`#canvasWrapper` clips with `overflow:hidden` so boxes scrolled above the top edge are hidden.
`syncHistory()` runs every frame and `layoutHistory()` stacks the past boxes in order just above the
live sent message.

Engagement is **scroll-only**: a **wheel-up over `window`**, *unless the wheel target is inside a
"text hitbox"* (`#userInput` or `#bubbleText`, which keep their own scrolling), increases
`A.scrollTarget`. **Wheel-down** decreases it. The toad's speech tail is hidden when scrolling
(`A.scroll >= 0.5`). **Esc** snaps `A.scrollTarget` to 0. Sending a new message also resets scroll
to 0. Removing the `#histLayer` markup + CSS, the `drawHistory`/`syncHistory`/`layoutHistory`
functions, the `recordMessage(...)` calls, and the `A.scroll`/`A.scrollTarget` fields reverts to the
pure live-only chat.

## Mobile layout (portrait phones)

On `@media (max-width: 768px) and (orientation: portrait)` (mirrored in JS as `MQ =
matchMedia(...)`) the desktop canvas-chat is swapped for a plain DOM chat, **but the scene stays
fullscreen**.

- **Fullscreen scene + toad in the corner.** The whole field must fill the screen while *only* the
  toad sits small at the bottom-right — and the toad is just pixels on the same 320×180 canvas as the
  field, so this needs **two canvases**. `#canvasWrapper` is fixed `100vw/100vh`; a 16:9 scene can't fill
  a tall portrait *and* show a wide span, so `canvas#scene` is `width:194vw; height:auto` anchored
  **bottom**-left (≈ grid x:0–165 as a band filling the *lower* screen, so the field reaches the bottom
  edge and the corner toad sits grounded on the grass). The scene band only fills the lower ~half, so a
  **third canvas `#sceneTop`** (320×180, same `194vw` width, positioned
  `bottom: calc(194vw*0.5625 - 2px)` = the scene's rendered height minus a 2px **overlap** so no gap
  line shows) stacks above `#scene` to fill the rest of the screen. **Seam continuity is critical**:
  both `#scene` and `#sceneTop` sample the *same* continuous gradient `skyAt(worldY)` (a clamped linear
  ramp SKY_MID→SKY_HZ keyed to world-y) — `drawSky()` uses `skyAt(y)`, `drawSceneTop()` uses
  `skyAt(y-180)` (its rows are above the main scene) + `cloudsT`. So there's no value jump and no slope
  kink at the join. Two more guards keep the join invisible: the wrapper has a `#6ebae2` (SKY_MID)
  background, and `drawAmbient()`'s top warm-wash + top vignette are applied **only on desktop**
  (on mobile the main scene's top edge *is* the seam, so tinting it there would draw a line). In
  `render()`, `drawToad()` is **skipped** when `MQ.matches`;
  instead `renderToadCorner()` re-renders just the toad onto a second `<canvas id="toadCorner">`
  (internal 84×98) pinned bottom-right. It works by swapping the module-level context `G` (now `let`,
  not `const`) to the corner ctx `GT`, translating by `(-TOAD_OX, -TOAD_OY)` ≈ `(-178,-69)` so the
  toad's grid bounding box lands at the corner canvas origin, calling `drawToad()`, then restoring
  `G`. All primitives (`rv`/`d`/…) close over `G`, so the swap redirects them for free.
- **Chat.** `#userInput`/`#sendBtn` sit bottom-left (left of the toad); the desktop **DOM** overlays
  (`#bubbleText`, `#sentMessage`, `#histLayer`) are `display:none !important`. **Crucially, the desktop
  *canvas* bubble system (`drawHistory`/`drawUserBubble`/`drawBubble`) is also skipped in `render()`
  when `MQ.matches`** — those draw bubble *pixels* onto `#scene`, which CSS can't hide, so leaving them
  on would bleed stray bubbles onto the scene band. The `#mobile-chat` flex column fills everything
  above the bottom strip and becomes the conversation. `dispatchMessage` still runs the desktop swipe
  *state* machinery every send (harmless now that nothing draws it — overlays hidden, canvas draws
  skipped), so `chatHistory`/`recordMessage` stay consistent. The mobile UI is layered on via
  `mobileAppend(text, role)`, guarded by `MQ.matches`: a
  **user** turn creates a fresh `.mobile-exchange` and **prepends** it to `#mobile-chat` (newest at the
  top, older slides down); the **toad** turn appends its `.mobile-msg` *beneath* the user message in
  that same container. The `'...'` bubble is held in `mobileThink` and its `innerHTML` is rewritten in
  place when the reply/error arrives.

Reverting to desktop-only: remove the mobile CSS block + `#toadCorner`/`#mobile-chat` markup, restore
`const G`, drop `MQ`/`GT`/`renderToadCorner` and the `MQ.matches` branches in `render()`/
`dispatchMessage`, and the `mobileAppend`/`mobileThink`/`mobileExchange` definitions.

## Backend (deploy-safe Gemini proxy)

On send, `dispatchMessage` runs the swipe-up animation, clears the input, and after a 700ms
`setTimeout` resets `A.chatState` to `IDLE` and closes the old toad bubble. That `setTimeout` body
is where the reply is fetched: it shows a `"..."` thinking bubble, then `POST`s
`{ contents: window.chatHistory }` to **`/api/chat`** and passes the returned `reply` to
`showText(reply)`. `showText(text)` is the sole entry point for displaying a reply (it measures the
text, then eases the bubble open).

**The key never touches the browser.** `api/chat.js` is a Node serverless function that holds the
Gemini API key in the `GEMINI_API_KEY` env var, hardcodes the model (`gemini-3-flash-preview`), adds
the system prompt + Google Search grounding tool + `BLOCK_NONE` safety settings server-side, and
returns `{ reply }` (or `{ error }`). The system prompt — the Toad's wise-philosopher persona —
lives **only** in `api/chat.js`; editing the Toad's voice (or the model) means editing that file,
not `index.html`.

`window.chatHistory` (built in `dispatchMessage`) is the running `contents` array of
`{ role, parts }` turns sent on each request, so the Toad has conversational memory within a
session. There is no settings UI or model selector — the client just sends the conversation and the
server decides everything else.
