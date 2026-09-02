# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wise Toad is an animated pixel-art scene: a meditating toad sitting in a peaceful grassy field at
night under a deep-navy starlit sky (swaying grass, wildflowers, drifting clouds, distant hills, a
crescent moon, fireflies), rendered to an HTML5 canvas, with a chat UI for "speaking to the Toad."
The scene has a **single state — night** (there is no day mode and no toggle). The entire scene — markup,
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

- **`P`** — the color palette, baked to **night** values (`hillFar`/`hillNear` + the toad's
  `tD/tM/tL/tB/tE/tSpot/tBelly/tBelly2/tWart/tLid`; most field colours are local consts, see below).
  **`S`** — scene config; after the field redesign only **`S.toad`** (the toad's x/y) still matters —
  the other room objects (`win`/`tv`/`shelf`…) are vestigial.
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
  sky → stars → moon → clouds → hills → trees → fence → field → background grass → flowers → **toad**
  → foreground grass (sways in front of the toad) → ambient (moonlight wash + fireflies) → bubbles.
  Reordering changes occlusion. Grass/flowers sway via `A.sway`; the per-blade tip offset grows with
  `tt*tt` (more bend at the tip).
- **Animation loop**: one `requestAnimationFrame(loop)` → `update(dt)` then `render()`. `dt` is
  clamped to 0.06s. All mutable runtime state lives in object **`A`** (`t` time, `sway` wind, `breath`
  toad, and all chat/bubble layout state).

## Night palette (single state — no day mode, no toggle)

The scene is **night-only**: deep navy sky, crescent moon, twinkling stars, fireflies, dark-blue
chat bubbles. There used to be a day/night theme system with a `#modeToggle` button; it was removed.
The night colours are now baked directly into the module-level constants — there is no `MODE`,
`THEMES`, `setMode`, or `body.night` class anymore.

- **`TH`** — a single `const` object holding the non-gradient, non-toad night colours:
  `grassTip`/`stem`, `treeA/B/C`, `fencePost/Rail/Dark`, `horizonGlow`/`fieldPatch`, `cloudW`/
  `cloudSh`, and the four bubble fill/border pairs (`tbFill/tbBorder` = toad, `ubFill/ubBorder` =
  user). Read directly by the draw functions.
- **Gradient anchors + palettes are `const`** at night values: `SKY_TOP`/`SKY_MID`/`SKY_HZ` and
  `GR_FAR`/`GR_NEAR` (`[r,g,b]`), plus `GCOLS` (grass) and `FCOLS` (flower pairs). The **toad + hill**
  colours live in `P` (`tD/tM/tL/tB/tE/tSpot/tBelly/tBelly2/tWart/tLid`, `hillFar`/`hillNear`).
- **Layout stores a palette index**: grass blades and flowers keep a `ci`/`fi` index (not a colour),
  resolved against `GCOLS`/`FCOLS` at draw time. **`stars`** is generated last (so it doesn't perturb
  the other deterministic arrays) with a *world-y* (`wy`); `drawStars()` shows those in the main sky
  (`0..YH`), `drawStarsTop()` shows the negative-`wy` ones in the mobile `#sceneTop` band.
- **Night draw functions**: `render()` calls `drawSky` → `drawStars` → `drawMoon` → `drawClouds` →
  hills/trees/fence/field/grass/flowers/toad → `drawAmbient` (cool moonlight wash + vignette +
  blinking fireflies from the `motes` array). The DOM chat text colours (reply/input/sent/history/
  links/mobile bubbles + the `.md-b` inline-bold class) are the dark-blue night values directly in the
  base CSS — no `.night` scoping.

To add a day mode back, you'd re-introduce a theme object + `MODE`/`setMode`, make `SKY_*`/`GR_*`/
`GCOLS`/`FCOLS`/`TH` swappable, restore `drawSun`/`drawBirds`, and re-add a toggle control.

## Chat system (the subtle part)

Bubbles are **hybrid canvas + DOM**: the pixel-art bubble *backgrounds, borders, and tails* are
drawn on the canvas (`drawBubble`, `drawUserBubble`), while the actual *text* is real DOM
(`#bubbleText` = toad's reply, `#sentMessage` = user's sent message, `#userInput` = live input).
`update()` re-syncs every DOM overlay's position/size/font to the canvas geometry on every frame —
canvas shapes and DOM text must be kept in lockstep or they visibly drift apart.

`showText(text)` measures required bubble height by briefly rendering the DOM offscreen
(`getBoundingClientRect`) before animating the bubble open (`A.bubbleTarget = 1`, `A.bubbleFrame`
eases 0→1).

`A.chatState` is a small machine: `IDLE` ↔ `SWIPING_UP`. On send (`dispatchMessage`), the entire previous
exchange is snapshotted into `A.old*` (`A.oldTw/oldTh/oldBy/oldBx` and `A.oldUserText/oldUserTh/oldUserBy`),
and the scene executes a **frame-driven synchronized dual-scroll animation** (`A.swipeProgress`, 0.76s–0.85s):
1. **Previous Exchange Ascend & Dissolve**: The previous user message (`#oldSentMessage`) scrolls from `y = 15`
   up into negative space (`y = -35`) with smooth opacity fading; the previous toad bubble (`#bubbleText`)
   cleanly detaches its speech tail from the toad's mouth (`chatState !== 'SWIPING_UP'`), ascends into the night
   sky, and dissolves into starlight.
2. **New Message Gliding Entrance**: The new user message (`#sentMessage`) detaches from the input dock
   (`y = 168 - th`) and glides upward across the meadow into `y = 15` following a balanced cubic ease-in-out
   curve with a gentle tactile cushion. Its border illuminates in luminous starlight cyan (`#829fd8`), cooling to
   celestial indigo (`#5c74b2`), and settles into midnight indigo (`#3a4c86`).
3. **Synchronized Handoff**: Driven purely by `update(dt)` every frame (no race-prone `setTimeout`). When
   `A.swipeProgress >= 1.0`, the old exchange clears and the toad immediately ignites its third-eye brow star
   to begin the thought entrance bloom.
4. **Mobile Parity**: `.mobile-msg.user` enters with an 8-bit stepped bloom (`@keyframes mobileUserEnter`,
   `steps(8, end)`) with glowing cyan borders, while `#mobile-chat` smoothly scrolls to keep the active exchange
   in view (`scrollTo({ top: scrollHeight, behavior: 'smooth' })`).

Bubble layout in `update()` enforces physics rules — the sent message **never** gets squashed; instead the toad
bubble is height-limited or the toad is pushed down to avoid overlap — and the articulated tail is wired to the
toad's mouth at a fixed `y = 100`. The toad's dialogue bubble width is defined by `TOAD_BW = 185` anchored to
`TBUB_R = 210`, spanning left to `x = 25` to provide generous reading width while preserving conversational stagger. Touch these constants carefully.

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
  kink at the join. Two more guards keep the join invisible: the wrapper has a `#101234` (night sky)
  background, and `drawAmbient()`'s top moon-wash + top vignette are applied **only on desktop**
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
  **user** turn creates a fresh `.mobile-exchange` and **appends** it to the *bottom* of `#mobile-chat`
  (newest at the bottom, like a normal messaging app — it rises up from the bottom edge via the
  `mobileSlideIn` `translateY(16px)→0` animation and pushes older exchanges upward out of view); the
  **toad** turn appends its `.mobile-msg` *beneath* the user message in that same container. Short
  conversations are pinned to the bottom (near the input) by `.mobile-exchange:first-child { margin-top:
  auto }`, which collapses to 0 once content overflows so scroll-up history still works. `mobileAppend`
  calls `mobileScrollBottom()` (sets `scrollTop = scrollHeight`) so each send jumps to the newest
  message. During thinking, no premature `"..."` bubble is shown; instead `#toadCorner` (84×98) shows
  the toad's brow star and meditative levitation, while `#mobileThought` renders the cosmic thought cloud
  floating high in the open starry sky (top: 24%), well clear of the user's message at the bottom.
  When the reply/error arrives after thought crystallization, `mobileAppend` is called with a stepped
  entrance animation (`mobileToadEnter`), and the log scrolls to the **top** of the toad's new message
  (`mobileScrollToTop(el)`) ~12px below the log top. This re-scroll only fires if `mobilePinnedBottom()`
  was true before the arrival.

Reverting to desktop-only: remove the mobile CSS block + `#toadCorner`/`#mobileThought`/`#mobile-chat` markup,
restore `const G`, drop `MQ`/`GT`/`GMT`/`renderToadCorner`/`renderMobileThought` and the `MQ.matches` branches in `render()`/
`dispatchMessage`, and the `mobileAppend`/`mobileScrollBottom`/`mobilePinnedBottom`/`mobileExchange` definitions.

## Backend (deploy-safe Gemini proxy) & Thought-to-Speech Transition

On send, `dispatchMessage` runs the swipe-up animation, clears the input, and after a 700ms
`setTimeout` resets `A.chatState` to `IDLE`, closes the old toad bubble, and enters `A.thinking = true`.
Rather than popping onto the screen abruptly, the thinking state unfolds via a choreographed **0.85s Thought Entrance Animation (`A.thinkIntro`)**:
1. **Third-Eye Ignition (0.00s .. 0.15s)**: A golden starlight spark ignites on the toad's brow between its closed eyes.
2. **Sequential Rising Connector Orbs (0.15s .. 0.45s)**: Connector Orbs 1 -> 2 -> 3 sprout sequentially upward from the temple into the sky with 1px/3px glints before expanding to full scale.
3. **Cosmic Cloud Stepped Bloom (0.45s .. 0.85s)**: At Orb 3's tip, the cloud sparks with a birth-flash and unfurls through an 8-bit stepped expansion curve (18% -> 42% -> 70% -> 90% -> 103.5% overshoot -> 100%) with active celestial cyan/indigo border highlights (`#5c74b2`, `#a0d8ef`) before settling into deep midnight blue.
4. On mobile, the corner toad's third eye ignites first, followed by the cloud unfurling with the same stepped bloom in the night sky.

While settled in thought, no speech bubble is rendered. On desktop, `drawThought()` renders the thought cloud lowered
on the screen (y >= 66 in the open meadow space at toad shoulder level), completely below the user's sent message
at the top (y: 15..60), cycling through 8-bit contemplation runes at 6 fps. On mobile, `renderMobileThought()`
renders the thought cloud raised high in the starry sky, far above the user message at the bottom.

When `/api/chat` returns, rather than an abrupt popup, the system orchestrates an organic, 1.4-second
multi-stage transition (`A.transPhase`):
1. **CONDENSING (0.0s .. 0.38s)**: The thought cloud condenses inward from 100% to 20% scale with an epiphany cross-spark, gathering cosmic runes into a concentrated golden wisdom pearl at its core.
2. **STREAMING & AWAKENING (0.38s .. 0.70s)**: The wisdom pearl streams down the connector orbs (Orbs 3 -> 2 -> 1 flash in sequence), the toad's third-eye brow blazes, a breath of inspiration puffs from its mouth, and the toad opens its serene eyes with golden starlight irises (`A.toadAwake`).
3. **BLOOMING (0.70s .. 1.22s)**: The tail connects directly from the toad's mouth to the sprout point, and the speech bubble unfurls with an 8-step retro pixel curve, active celestial blue starlight borders (`#829fd8` -> `#5c74b2`), and soft text fade-in. On mobile, the corner toad awakens and the reply blooms into `#mobile-chat` with an 8-step stepped bounce (`mobileToadEnter`).
4. **SETTLING (1.22s .. 1.42s)**: Borders relax into midnight indigo (`#33437a`), and the toad remains calmly present with its enlightened gaze while imparting wisdom.

**The key never touches the browser.** `api/chat.js` is a Node serverless function that holds the
Gemini API key in the `GEMINI_API_KEY` env var, hardcodes the model (`gemini-3-flash-preview`), adds
the system prompt + Google Search grounding tool + `BLOCK_NONE` safety settings server-side, and
returns `{ reply }` (or `{ error }`). The system prompt — the Toad's wise-philosopher persona —
lives in `api/chat.js` and `netlify/functions/chat.js`; editing the Toad's voice (or the model) means editing those files,
not `index.html`.

**Dynamic Proportionality & Reciprocity**: The Toad's response length is calibrated to the substance and intent
of the seeker's message:
- Casual greetings, short banter, or single-word inputs (`"yo"`, `"hello"`, `"cool"`) receive brief, grounded 1-2 sentence replies with quiet warmth. No unsolicited multi-paragraph lectures or external links.
- Concise queries (`"who are you?"`, `"what is this place?"`) receive succinct, evocative 2-4 sentence responses.
- Deep philosophical questions or personal dilemmas receive multi-paragraph, nuanced explorations synthesizing Eastern insight and Western philosophy.
- External recommendations (books, lectures, podcasts) are strictly conditional: never given for greetings, and only offered when explicitly requested or uniquely illuminating.

`window.chatHistory` (built in `dispatchMessage`) is the running `contents` array of
`{ role, parts }` turns sent on each request, so the Toad has conversational memory within a
session. There is no settings UI or model selector — the client just sends the conversation and the
server decides everything else.
