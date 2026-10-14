/* =====================================================================
   Wise Toad — "what is the sky doing where the visitor is?"

   GET /api/weather[?lat=..&lon=..]  →  { lat, lon, city, current }

   The meadow mirrors the visitor's real sky. This finds roughly where
   they are — the host's IP-geo headers (Vercel), or an IP lookup (local
   dev, other hosts) — then asks Open-Meteo (free, no key) for the current
   conditions there. index.html turns `current` into cloud, rain, snow,
   fog and wind. If this endpoint is missing (static hosting), the page
   asks the same two services directly from the browser.

   No secrets and no dependencies: Node 18+ global `fetch` only.
   ===================================================================== */

'use strict';

const CURRENT = 'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,snow_depth,visibility';

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const PRIVATE_IP = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|f[cd]|fe80:|::ffff:(127|10|192\.168)\.|$)/i;

async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* The visitor's IP → rough coordinates. A private/loopback address means
   the server runs on the visitor's own network (local dev), so looking up
   the server's public IP finds the visitor too. */
async function lookupIP(ip) {
  const g = await getJSON(PRIVATE_IP.test(ip || '')
    ? 'https://get.geojs.io/v1/ip/geo.json'
    : `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`);
  const lat = num(g.latitude), lon = num(g.longitude);
  return lat === null || lon === null ? null : { lat, lon, city: g.city || '' };
}

function fromQuery(q) {
  const lat = num(q.get('lat')), lon = num(q.get('lon'));
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, city: '' };
}

function decode(v) {
  try { return decodeURIComponent(v || ''); } catch { return ''; }
}

async function skyAt(loc) {
  const om = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat.toFixed(3)}&longitude=${loc.lon.toFixed(3)}&current=${CURRENT}`);
  return { lat: loc.lat, lon: loc.lon, city: loc.city || '', current: om.current || null };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');   // per-visitor answer
  try {
    const h = req.headers;
    const vLat = num(h['x-vercel-ip-latitude']), vLon = num(h['x-vercel-ip-longitude']);
    const loc = fromQuery(new URL(req.url, 'http://localhost').searchParams)
      || (vLat !== null && vLon !== null ? { lat: vLat, lon: vLon, city: decode(h['x-vercel-ip-city']) } : null)
      || await lookupIP(String(h['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '');

    if (!loc) {
      res.status(200).json({ error: 'Location unknown.' });
      return;
    }
    res.status(200).json(await skyAt(loc));
  } catch (err) {
    res.status(502).json({ error: 'The sky could not be read.' });
  }
};
