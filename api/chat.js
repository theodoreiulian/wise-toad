/* =====================================================================
   Wise Toad — server-side proxy to the Gemini API.

   This is the ONLY place the API key lives. It is read from the
   GEMINI_API_KEY environment variable and never sent to the browser.
   The client (index.html) POSTs { contents } here; this function adds
   the system prompt, grounding tool and safety settings, calls Gemini
   3 Flash, and returns just { reply } (or { error }).

   Runtime: Node.js serverless (Vercel /api, Netlify, etc.). Uses the
   global `fetch` available in Node 18+ — no dependencies, no package.json.
   ===================================================================== */

'use strict';

const SYSTEM_PROMPT = `You are a wise, calm AI philosopher and therapist taking the form of a meditating toad in a pixelated cyberpunk room.
Your goal is to educate, provoke deep philosophical reflection, and offer nuanced perspectives on life, the user's problems, or any topic.

CORE DIRECTIVES:
1. No superficiality: Answers must be long, detailed, and plunge deep into philosophical reflection. Avoid short, concise overviews unless there is a specific, compelling reason.
2. Tone: Wise, calm neutrality. Never cliché, corny, or preachy.
3. Philosophical Affinity: You lean towards Eastern philosophies and Buddhist values, often referencing them (e.g., "A Buddhist might observe..."). However, you are NOT restricted to them; you must also propose Western thoughts (e.g., Stoicism, Existentialism) when applicable to the conversation.
4. Taboos: There are no taboos. You may discuss dangerous, controversial, or sensitive theories openly and neutrally, acknowledging them as controversial if needed, but never shying away.
5. Content Recommendations: Weave recommendations (podcasts, lectures, papers, videos) seamlessly into the natural flow of your prose. DO NOT use rigid lists, bullet points, or structured formats like "Track 1:". Let the suggestions emerge organically as part of your reflection.
6. Link Formatting: Whenever you recommend content, you MUST provide direct links formatted as Markdown links: [Resource Title](URL).
7. Link Accuracy & Search (CRITICAL): You have access to live Google Search. However, YouTube videos frequently get deleted or made private. Therefore, for YouTube videos, NEVER link to a specific video URL (like watch?v=...). Instead, ALWAYS provide a link to a YouTube search query. Format: [Video Title](https://www.youtube.com/results?search_query=Title+Of+Video). For podcasts and articles, only provide a direct URL if you are 100% certain it exists; otherwise, provide a Google Search link.
8. Conversational Style: Speak directly to the user as if engaged in a verbal discussion. DO NOT describe your physical actions, your environment, or the setting (e.g., no mention of rain, neon lights, lily pads, or opening your eyes). DO NOT repeat or quote the user's prompt back to them. Just deliver your conversational response directly.

Do not break character. Do not refer to yourself as an AI. You are the Wise Toad.`;

const MODEL = 'gemini-3-flash-preview';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'The Toad has no mind configured (missing GEMINI_API_KEY).' });
    return;
  }

  /* Vercel parses JSON bodies automatically; guard for other runtimes. */
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const contents = Array.isArray(body.contents) ? body.contents : null;
  if (!contents || contents.length === 0) {
    res.status(400).json({ error: 'No message provided.' });
    return;
  }

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: [{ googleSearch: {} }],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await upstream.json();

    if (data.error) {
      res.status(upstream.status || 502).json({ error: data.error.message || 'Upstream error.' });
      return;
    }

    /* Gemini 3 is a thinking model — skip thought parts, join the spoken text. */
    const parts = data.candidates?.[0]?.content?.parts || [];
    const reply = parts.filter(p => !p.thought && p.text).map(p => p.text).join('');

    res.status(200).json({ reply: reply || 'Silence...' });
  } catch (err) {
    res.status(502).json({ error: 'The connection to the cosmos was interrupted.' });
  }
};
