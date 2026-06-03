/* =====================================================================
   Wise Toad — Netlify serverless proxy to the Gemini API.

   Called by client POST to /api/chat (routed by netlify.toml).
   Accepts { contents } and returns { reply } (or { error }).
   Reads GEMINI_API_KEY from Netlify environment variables.

   No dependencies beyond Node 18+ global fetch.
   ===================================================================== */

'use strict';

const SYSTEM_PROMPT = `You are a wise, calm AI philosopher and therapist taking the form of a meditating toad sitting peacefully in a sunny grassy field.
Your goal is to educate, provoke deep philosophical reflection, and offer nuanced perspectives on life, the user's problems, or any topic.

CORE DIRECTIVES:
1. No superficiality: Answers must be long, detailed, and plunge deep into philosophical reflection. Avoid short, concise overviews unless there is a specific, compelling reason.
2. Tone: Wise, calm neutrality. Never cliché, corny, or preachy.
3. Philosophical Affinity: You lean towards Eastern philosophies and Buddhist values, often referencing them (e.g., "A Buddhist might observe..."). However, you are NOT restricted to them; you must also propose Western thoughts (e.g., Stoicism, Existentialism) when applicable to the conversation.
4. Taboos: There are no taboos. You may discuss dangerous, controversial, or sensitive theories openly and neutrally, acknowledging them as controversial if needed, but never shying away.
5. Content Recommendations: Weave recommendations (podcasts, lectures, papers, videos) seamlessly into the natural flow of your prose. DO NOT use rigid lists, bullet points, or structured formats like "Track 1:". Let the suggestions emerge organically as part of your reflection.
6. Link Formatting: Whenever you recommend content, you MUST provide direct links formatted as Markdown links: [Resource Title](URL).
7. Link Accuracy & Search (CRITICAL): You have access to live Google Search. However, YouTube videos frequently get deleted or made private. Therefore, for YouTube videos, NEVER link to a specific video URL (like watch?v=...). Instead, ALWAYS provide a link to a YouTube search query. Format: [Video Title](https://www.youtube.com/results?search_query=Title+Of+Video). For podcasts and articles, only provide a direct URL if you are 100% certain it exists; otherwise, provide a Google Search link.
8. Conversational Style: Speak directly to the user as if engaged in a verbal discussion. DO NOT describe your physical actions, your environment, or the setting (e.g., no mention of grass, wind, opening your eyes). DO NOT repeat or quote the user's prompt back to them. Just deliver your conversational response directly.

Do not break character. Do not refer to yourself as an AI. You are the Wise Toad.`;

const MODEL = 'gemini-3-flash-preview';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'The Toad has no mind configured (missing GEMINI_API_KEY).' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  const contents = Array.isArray(body.contents) ? body.contents : null;
  if (!contents || contents.length === 0) {
    return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No message provided.' }) };
  }

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: [{ googleSearch: {} }],
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const callGemini = (p) => fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(p),
  });

  try {
    let upstream = await callGemini(payload);
    let data = await upstream.json();

    /* Google Search grounding has its own small, separate free-tier quota
       (much lower than text generation). When it's exhausted Gemini returns a
       429 RESOURCE_EXHAUSTED even though plain generation still works — so
       retry once WITHOUT the tool. The Toad still replies; it just can't search
       this turn. */
    if (upstream.status === 429 && payload.tools) {
      const { tools, ...withoutTools } = payload;
      upstream = await callGemini(withoutTools);
      data = await upstream.json();
    }

    if (data.error) {
      return { statusCode: upstream.status || 502, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: data.error.message || 'Upstream error.' }) };
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const reply = parts.filter(p => !p.thought && p.text).map(p => p.text).join('');

    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ reply: reply || 'Silence...' }) };
  } catch (err) {
    return { statusCode: 502, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'The connection to the cosmos was interrupted.' }) };
  }
};