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
