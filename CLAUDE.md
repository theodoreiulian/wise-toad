# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wise Toad is an animated pixel-art scene: a meditating toad sitting in a peaceful grassy field
(swaying grass, wildflowers, drifting clouds, distant hills, poplars, a fence) rendered to an HTML5
canvas, with a chat UI for "speaking to the Toad." **The meadow mirrors the visitor's real sky**: the
same time of day (real sun position, real moon position and phase) and the same weather (cloud,
rain, drizzle, showers + rainbow, storm + lightning, snow + snow cover, fog, frost, wind) as wherever
they are — see **Living sky** below. There is no toggle. The entire scene — markup, CSS, and the
rendering/chat engine — lives in `index.html` inside one IIFE
(`<script>(() => { 'use strict'; ... })()</script>`). The Toad's replies come from Gemini via a
small server-side proxy in `api/chat.js` (see **Backend** below); the visitor's location + current
weather come from `api/weather.js`. Those (plus their Netlify twins) are the only other source files.

## Running

The pixel scene itself needs no build step — open `index.html` directly, or `python3 -m http.server
8000`. But the chat only works when the `/api/chat` proxy is reachable, which means running it
through a serverless host. For local development with replies:

```bash
vercel dev            # serves index.html + /api/chat, reads GEMINI_API_KEY from .env.local
```

`node local-server.js` serves the same two endpoints without the Vercel CLI. See `DEPLOY.md` for
full deploy/port instructions. External runtime dependencies: the VT323 Google Font, and for the
living sky the free keyless APIs Open-Meteo (weather) and geojs.io (IP → location), reached via
`/api/weather` or directly from the browser when that endpoint is missing (static hosting,
`file://`). Offline, the sky still follows the clock (location guessed from the timezone) and the
last cached weather; the Toad stays silent without the chat proxy.

**Preview any sky** with URL params (no network needed when `lat`, `lon` and `weather` are all set):
`?time=19:40`, `?date=2026-06-21`, `?timelapse=120` (sim seconds per real second),
`?lat=48.85&lon=2.35`, `?weather=clear|partly|cloudy|overcast|fog|drizzle|rain|showers|storm|snow|frost`.
`window.ENV` exposes the live state (set `ENV.W` to a new weather object to watch it ease in).

## Coordinate system (read this first)

The whole project thinks in a fixed **320×180 internal pixel grid** (`const W = 320, H = 180`).
The `<canvas>` backing store is locked to that size with `imageSmoothingEnabled = false` and
`image-rendering: pixelated`. `resize()` is a no-op now: the wrapper is `position:fixed; inset:0; width:100vw; height:100vh`, so the scene always stretches edge-to-edge. It never changes W/H. Every drawing call uses
this 320×180 space, so 1 unit = 1 art pixel regardless of screen size.

DOM overlays (`#bubbleText`, `#sentMessage`, `#userInput`, `#sendBtn`) are positioned by converting
grid coordinates to **percentages of W/H** (e.g. `left: (x/W)*100 + '%'`) so they stay glued to the
right canvas pixels at any scale. Font sizes are scaled by `wrapperH / H` for the same reason.

## Architecture

- **`P`** — the color palette. The toad's `tD/tM/tL/tB/tE/tSpot/tBelly/tBelly2/tWart/tLid` and
  `hillFar`/`hillNear`/`hillRim` are **rewritten every palette tick** by `buildPalette()` (the values
  in the literal are only first-frame defaults). **`S`** — scene config; only **`S.toad`** (the
  toad's x/y) still matters — the other room objects (`win`/`tv`/`shelf`…) are vestigial.
- **Horizon & field constants**: `YH = 96` is the horizon (sky above, field below); `GCOLS` (grass)
  and `FCOLS` (flower colour pairs) are the palettes (entries relit each tick).
- **Deterministic RNG**: `mulberry(7)` seeds `frand`, which generates the **field layout once** at
  load — `grassB`/`grassF` (background/foreground grass tufts), `flowers`, `cloudsA`/`cloudsT`, `motes`,
  `trees`, `fence`, `stars`. The seed keeps the field identical across reloads. Everything the living
  sky added (cloud shapes, extra/deck clouds, rain drops, snow flakes) comes from a **separate**
  stream, `rng2 = mulberry(4242)`, so the field layout never shifts; the Milky Way uses `mulberry(99)`.
- **Draw primitives**: `rv(x,y,w,h,c)` = filled rect, `d(x,y,c)` = single pixel, `pxLine` =
  Bresenham line, `glowAt(x,y,r,scaleX,rgb,a)` = soft elliptical radial glow (sun/moon halos, fog
  banks). Colour helpers live at the top of the LIVING SKY section (`mixC`, `css`, `cssA`, `lum`,
  `smooth`). (`boxR`/`boxL` fake-iso helpers survive but are unused.)
- **`render()` draws strictly back-to-front** (painter's algorithm). The call order *is* the z-order:
  sky (+ sun glow) → Milky Way → stars → shooting star → moon → sun → rays → clouds → rainbow →
  lightning bolt → birds → hills → trees → fence → field → back fog/mist → background grass → flowers
  → butterflies → cloud shadows → **toad** → foreground grass → rain/snow → front fog → ambient
  (light wash, golden-hour light leak, vignette, fireflies/pollen, lightning flash) → bubbles.
  Reordering changes occlusion. Grass/flowers sway via `A.sway` (its rate and the blade bend follow
  the real wind); the per-blade tip offset grows with `tt*tt` (more bend at the tip).
- **Animation loop**: one `requestAnimationFrame(loop)` → `update(dt)` then `render()`. `dt` is
  clamped to 0.06s. All mutable runtime state lives in object **`A`** (`t` time, `sway` wind, `breath`
  toad, all chat/bubble layout state, and the sky clocks/events: `cloudT`, `windX`, `precipT`,
  `skyClock`, `flash`/`bolt`, `shoot`, `birds`). `update()` calls `updateEnv(dt)` first.

## Living sky (time of day + weather — the meadow mirrors the visitor's sky)

Everything lives in the **LIVING SKY** section of `index.html` (after the field layout).

- **Where** (`initSky` / `refreshSky` / `fetchSky`): first frame uses the `localStorage` cache
  (`wiseToad.sky`) or `guessLocation()` (timezone's standard offset → longitude, tz region → rough
  latitude). Then `fetchSky()` asks `/api/weather` (host IP-geo + Open-Meteo); if that's missing it
  calls geojs.io + Open-Meteo straight from the browser. Precise browser geolocation is used **only
  if already granted** — the page never prompts. Weather refreshes every 15 min and on tab return
  (>10 min stale). Location changes ease (`ENV.latT/lonT`), so the sky never jumps.
- **When** (`updateSkyBodies`, every 0.25 s): `skyNow()` (real clock, or the `?time`/`?date`/
  `?timelapse` sim clock) → a compact **SunCalc** port gives real sun + moon altitude/azimuth and the
  moon's phase/illuminated fraction. `skyXY()` maps them to the grid: the viewer faces the equator,
  so the sun rises left and sets right; on desktop ±130° of azimuth is squeezed into x 12..212 so a
  rising/setting sun is **never hidden behind the toad**; on phones the arc spans the visible band
  (`visRange()`). `ENV.morning` (from azimuth) blends dawn vs dusk palettes.
- **Weather** (`readWeather`): Open-Meteo `current` (`weather_code` via the `WMO` table, cloud
  cover, wind, temperature, humidity, visibility, snow depth) → `ENV.W` = `{cloud, rain, drizzle,
  shower, snow, fog, storm, wind, snowCover, frost, temp, hum}`. `updateEnv` eases `ENV` toward it
  (snow cover accumulates slowly). Presets for previews are in `WX_PRESETS`.
- **Palette** (`buildPalette`, every 0.25 s): sun elevation picks a point on a keyframe timeline —
  `KF_EVE` (day → afternoon → golden → low sun → sunset → afterglow → blue hour → night) and
  `KF_MORN` (its own cooler, pinker dawn keys; day and night keys are shared) — each key holds sky
  stops (`zen/top/mid/hz`), sun glow, key light/ambient/saturation, sun disk and cloud colours.
  Weather then washes the sky toward a cloud deck (darker/greyer for rain, slate-teal + a bright
  horizon band for storms, bluer at night) and toward fog; dims and greys the light; and
  `lit(albedo)` relights every **`ALB`** colour (true daylight colours of the toad, grass, flowers,
  hills, trees, fence, field, snow) into `P`, `TH`, `GCOLS`, `FCOLS`, `PAL.field`. Distant things haze
  toward the horizon by day and toward the mid-sky at low sun (backlit silhouettes). Night light
  is floored so the toad never vanishes, and a bright moon lifts the night.
- **`PAL`** holds everything else the draw functions read: `PAL.sky` (one blurred gradient for
  world-y −180..YH — main canvas uses rows 180+, mobile `#sceneTop` rows 0..179, so there is no seam),
  visibilities (`starVis`, `mwVis`, `sunVis`, `moonVis`, `rays`, `rainbow`, `firefly`, `motes`,
  `dew`, `mist`, `bfly`, `shadowA`), rain/snow colours, toad rim/shadow, vignette and light wash.
  It also sets the `--sky` CSS variable and `<meta name="theme-color">` (page chrome follows the sky).
- **What appears when**: sun disk (bigger/warmer near the horizon, sinks behind the hills) + hot
  horizon glow; real-phase moon (pale by day, earthshine + halo at night); stars + Milky Way (clear,
  moonless nights) + occasional shooting stars; cumulus sprites (`CLOUDS`, each with a coverage
  threshold `thr` and an eased alpha `c.a`; repainted only when the quantised cloud colours change;
  big "deck" clouds gather only near overcast); crepuscular rays through broken cloud at low sun;
  sun-lit cloud shadows sliding over the field; a rainbow arcing away from the sun when it shines
  through rain; lightning (flash + bolt, kept clear of the toad); birds on fair days; butterflies on
  warm calm days; fireflies on warm dry nights, golden pollen in low sun; dew glints and dawn mist
  on humid mornings; rain streaks + splashes (3 depth layers, slanted by wind); snow flakes, snow
  cover (buried grass, hidden flowers, white hills/trees/fence caps, drift shadows) and a snow cap on
  the toad; raindrops beading on the toad; a warm (or moonlit) rim light on his flank facing a low
  sun; his shadow stretches away from a low sun.
- **Mobile**: `drawSceneTop()` repeats sky glow, Milky Way, stars, rays, clouds, rain/snow, light wash
  and flash in the same world coordinates (+180). `drawPrecipStage()` adds near rain/snow in front of
  the big `#toadMobile` toad, and lightning lights his pixels via `'source-atop'`.
- **Chat UI colours are deliberately constant** (`TH.tbFill/tbBorder/ubFill/ubBorder`, the DOM text
  colours and the cosmic thought cloud stay midnight blue) so text reads the same over noon or storm.

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
   cleanly detaches its speech tail from the toad's mouth (`chatState !== 'SWIPING_UP'`), ascends into the
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

On `@media (max-width: 768px) and (orientation: portrait)` (mirrored in JS as `MQ = matchMedia(...)`), the scene layout adapts to mobile:

- **Fullscreen backdrop + big centered Toad.** The meadow backdrop is centered horizontally on `canvas#scene`, with horizon grounded around 44vh from the bottom. `#sceneTop` stacks seamlessly above `#scene` to fill the sky above the field.
- **The Wise Toad Stage (`#toadMobile`).** A dedicated 140×160 canvas centered at `left: 50%; top: 52%; transform: translate(-50%, -50%); width: min(72vw, 290px);` renders the Toad big in the center of the screen in lotus pose, with breathing, forehead third-eye spark, golden irises awakening, and foreground grass blades swaying across its lap. During the thinking and transition states, rising connector orbs sprout upward from its temple to the cosmic thought cloud centered above its head, cycling runes at 6 fps, condensing into a wisdom pearl, and streaming down to its mouth with inspiration breath puff.
- **Text Input Box at Bottom.** `#userInput`, `#inputBubbleBg`, `#inputBubbleBorder`, and `#sendBtn` span across the bottom of the screen with safe-area padding (`bottom: calc(16px + env(safe-area-inset-bottom))`), providing a wide, comfortable typing area. The layout is layered: `#inputBubbleBg` (z-index 4, background fill), `#userInput` (z-index 5, clipped text area), `#inputBubbleBorder` (z-index 6, opaque pixel border frame with `pointer-events: none`), and `#sendBtn` (z-index 7). When user text scrolls upward, it cleanly passes behind the opaque top border rather than rendering over it.
- **Mobile Dialogue Overlay (`#mobileDialogue`).**
  - **Pixel-Art Rounded Rectangle Canvases (`#mobileUserBg`, `#mobileToadBg`).** Both dialogue bubbles are rendered using clean, authentic retro pixel-art rounded rectangles drawn on low-res `<canvas>` elements scaled with `image-rendering: pixelated;` at the Toad's 3.5px grid scale (`renderThoughtCloud`). They preserve all the cosmic thought bubble design elements (colors, shading, moonlight highlights, and glints) within a clean rounded rectangular silhouette:
    - **Stepped Rounded Corners**: 2-pixel retro corner cuts on the user message box matching `#inputBubbleBg`, and smooth 4-pixel stepped circular corners (2 horizontal, 1 diagonal, 2 vertical) on the Toad's message box for a rounder yet crisp retro pixel-art contour.
    - **Moonlight Shading Highlight**: A 1-retro-pixel highlight line right beneath the top border (`#5c74b2`) with twinkling starlight glint pixels (`#829fd8`) on the user message box, while the Toad's message box maintains a clean, uniform 1-pixel border on all four sides without extra pixel lines.
    - **Cosmic Palette**: Deep cosmic fills (`#1c2950` for user, `#141e42` for toad) with midnight borders (`#3a4c86` for user, `#33437a` for toad).
    - **Padding**: Clean padding (`padding: 10px 18px` on `#mobileUserContent`, `padding: 14px 20px` on `#mobileToadContent`) with crisp `'VT323'` typography.
  - **User Message (`#mobileUserMsg`).** On send, glides up from the bottom input to the top of the screen as a horizontally centered rounded rectangle (`left: 0; right: 0; margin: 0 auto; width: fit-content; min-width: 160px; max-width: calc(100% - 28px);`). Sizing is dynamic based on text length: short questions stay compact, while medium-to-long queries widen up to the exact full width of the Toad's response (`calc(100% - 28px)`). Animated with an active luminous starlight halo (`mobileUserGlideUp`).
  - **Toad Response (`#mobileToadMsg`) & Thought-to-Message Pop-Up Transition.** No speech tail or arrow. Instead, the response emerges directly from the Toad's thought bubble as the culmination of the thinking sequence:
    1. During contemplation, the thought cloud hovers above the Toad's forehead with rising connector orbs.
    2. When done thinking (`CONDENSING` / `STREAMING`), the thought cloud radiates an epiphany core flash (`#ffffff`, `#e6c468`), and celestial starlight sparks stream upward out of the thought bubble.
    3. The Toad's response (`#mobileToadMsg`) pops up directly from the thought bubble position (`transform-origin: 50% 100%`) with `mobileThoughtPop` (springy 0.52s curve) and an active celestial starlight halo.
    4. Concurrently, the thought cloud dissolves upward with rising starlight dissipation sparkles, merging seamlessly into the dialogue box as it settles into place.
  - **Full-Screen Long Response Mode.** If the Toad's response is too long to fit comfortably on screen without colliding with the Toad/input (`naturalH > availableSpace`), `.is-fullscreen` activates: the user message smoothly glides upward out of the viewport (`transform: translateY(calc(-100% - 40px)); opacity: 0;`), the Toad's response moves up to the top of the screen (`top: calc(14px + env(safe-area-inset-top))`), expands down to right above the bottom input (`bottom: calc(72px + env(safe-area-inset-bottom))`), its canvas background updates seamlessly to the fullscreen height, and its inner container (`#mobileToadContent`) becomes smoothly scrollable with touch (`overflow-y: auto; -webkit-overflow-scrolling: touch;`).
  - **Conversational Reset.** Sending a new message clears full-screen mode, dissolves previous bubbles, and starts the cycle anew.

## Backend (deploy-safe Gemini proxy) & Thought-to-Speech Transition

On send, `dispatchMessage` runs the swipe-up animation, clears the input, and after a 700ms
`setTimeout` resets `A.chatState` to `IDLE`, closes the old toad bubble, and enters `A.thinking = true`.
Rather than popping onto the screen abruptly, the thinking state unfolds via a choreographed **0.85s Thought Entrance Animation (`A.thinkIntro`)**:
1. **Third-Eye Ignition (0.00s .. 0.15s)**: A golden starlight spark ignites on the toad's brow between its closed eyes.
2. **Sequential Rising Connector Orbs (0.15s .. 0.45s)**: Connector Orbs 1 -> 2 -> 3 sprout sequentially upward from the temple into the sky with 1px/3px glints before expanding to full scale.
3. **Cosmic Cloud Stepped Bloom (0.45s .. 0.85s)**: At Orb 3's tip, the cloud sparks with a birth-flash and unfurls through an 8-bit stepped expansion curve (18% -> 42% -> 70% -> 90% -> 103.5% overshoot -> 100%) with active celestial cyan/indigo border highlights (`#5c74b2`, `#a0d8ef`) before settling into deep midnight blue.
4. On mobile, the corner toad's third eye ignites first, followed by the cloud unfurling with the same stepped bloom in the sky.

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

**`/api/weather`** (`api/weather.js`, Vercel/local; `netlify/functions/weather.mjs`, a Functions
2.0 module because only those get `context.geo`): `GET [?lat&lon]` → `{ lat, lon, city, current }`.
Location comes from the query, the host's IP-geo (Vercel `x-vercel-ip-*` headers / Netlify
`context.geo`), or a geojs.io IP lookup (a private/loopback IP means local dev, so the server's own
public IP is looked up). It holds no secrets; the browser can do the same without it.

**The key never touches the browser.** `api/chat.js` is a Node serverless function that holds the
Gemini API key in the `GEMINI_API_KEY` env var, hardcodes an ordered `MODELS` list (`gemini-3-flash-preview` → `gemini-3.6-flash` → `gemini-3.8-flash`, falling through on 503 "high demand"), adds
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
