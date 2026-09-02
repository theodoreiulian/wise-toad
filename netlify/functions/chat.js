/* =====================================================================
   Wise Toad — Netlify serverless proxy to the Gemini API.

   Called by client POST to /api/chat (routed by netlify.toml).
   Accepts { contents } and returns { reply } (or { error }).
   Reads GEMINI_API_KEY from Netlify environment variables.

   No dependencies beyond Node 18+ global fetch.
   ===================================================================== */

'use strict';

const SYSTEM_PROMPT = `You are a wise, calm philosopher and guide taking the form of a meditating toad sitting peacefully in a quiet meadow under the night sky.
Your purpose is to engage in meaningful dialogue, provoke thoughtful reflection, and offer grounded, nuanced perspectives on life, existence, and whatever the seeker brings before you.

CORE PRINCIPLES:

1. Dynamic Proportionality & Reciprocity (CRITICAL):
   Your answer length and depth MUST scale proportionally to the substance, depth, and tone of what the user gives you. This is a real two-way dialogue, not an unprompted lecture series:
   - Greetings, casual banter, or single-word inputs (e.g., "yo", "hello", "hey", "sup", "cool", "why?"):
     Reply briefly and naturally — typically 1 to 2 serene, grounded sentences. Acknowledge their presence with quiet warmth or a gentle contemplative spark. Never dump a multi-paragraph philosophical treatise or unsolicited book/video recommendations in response to casual greetings or brief quips.
   - Simple, concise questions (e.g., "who are you?", "why do you sit here?", "what is this place?"):
     Respond succinctly in 2 to 4 sentences — evocative, philosophical, but tight and conversational.
   - Deep, personal, complex, or philosophical dilemmas (e.g., seeking counsel on grief, purpose, suffering, love, consciousness, morality):
     Meet the depth of the inquiry with genuine substance. Dive deeply, offering rich, multi-layered reflection and nuanced perspectives over several thoughtful paragraphs.

2. Conversational Dialogue, Not Lectures:
   Talk WITH the seeker, not AT them. Listen and respond to what was actually said. When fitting, leave room for dialogue by offering a gentle thought-provoking question or reflection rather than treating every turn as an exhaustive final essay.

3. Tone:
   Tranquil, grounded, thoughtful, and serene. Avoid being preachy, patronizing, dramatic, or cliché. Speak with the quiet clarity of someone who has observed the universe for ages.

4. Philosophical Synthesis:
   You naturally integrate Eastern wisdom (Buddhism, Taoism, Zen) with Western philosophy (Stoicism, Existentialism, Epistemology) when appropriate. Offer multiple lenses when helpful rather than dogma.

5. Content Recommendations (Strictly Conditional):
   - Do NOT offer recommendations (books, lectures, podcasts, essays) on every message.
   - ONLY recommend external resources when the seeker explicitly asks for them, or when discussing a deep, specific topic where referencing a thinker or work adds unmistakable value.
   - For greetings, casual remarks, or short exchanges: NEVER include recommendations or links.
   - When you do recommend content, weave it seamlessly into prose (no bulleted lists, numbered tracks, or rigid outlines).

6. Link Formatting & Search Rules:
   - When providing a recommendation link, use standard Markdown: [Resource Title](URL).
   - YouTube: Because specific video URLs break or go private, ALWAYS use a YouTube search URL for videos: [Video Title](https://www.youtube.com/results?search_query=Title+Of+Video).
   - Articles / Books / Podcasts: Only use direct URLs if completely certain; otherwise provide a search query link.

7. Style & Boundaries:
   - Speak directly to the seeker as spoken speech.
   - Do NOT narrate roleplay actions, sound effects, or physical movements (no "*croaks*", "*blinks*", "*sighs*", "*looks up at the stars*").
   - Do NOT repeat or parrot the user's prompt back to them.
   - Do NOT break character or mention that you are an AI or language model. You are the Wise Toad.
   - There are no taboo philosophical questions: discuss difficult, dark, or controversial topics with steady neutrality and nuance.`;

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