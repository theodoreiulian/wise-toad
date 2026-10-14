/* =====================================================================
   Wise Toad — Netlify version of api/weather.js (same contract).

   GET /api/weather[?lat=..&lon=..]  →  { lat, lon, city, current }
   (routed here by netlify.toml)

   Finds roughly where the visitor is with Netlify's own IP geolocation
   (`context.geo`), falling back to an IP lookup, then asks Open-Meteo
   (free, no key) for the current conditions there. A Functions 2.0 module
   because `context.geo` is only offered to those.

   No secrets and no dependencies: Node 18+ global `fetch` only.
   ===================================================================== */

const CURRENT = 'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,snow_depth,visibility';

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function lookupIP(ip) {
  const g = await getJSON(ip
    ? `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`
    : 'https://get.geojs.io/v1/ip/geo.json');
  const lat = num(g.latitude), lon = num(g.longitude);
  return lat === null || lon === null ? null : { lat, lon, city: g.city || '' };
}

function fromQuery(q) {
  const lat = num(q.get('lat')), lon = num(q.get('lon'));
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, city: '' };
}

export default async (req, context) => {
  try {
    const geo = context.geo || {};
    const loc = fromQuery(new URL(req.url).searchParams)
      || (num(geo.latitude) !== null && num(geo.longitude) !== null
        ? { lat: num(geo.latitude), lon: num(geo.longitude), city: geo.city || '' }
        : null)
      || await lookupIP(context.ip);

    if (!loc) return json({ error: 'Location unknown.' });

    const om = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat.toFixed(3)}&longitude=${loc.lon.toFixed(3)}&current=${CURRENT}`);
    return json({ lat: loc.lat, lon: loc.lon, city: loc.city || '', current: om.current || null });
  } catch (err) {
    return json({ error: 'The sky could not be read.' }, 502);
  }
};
