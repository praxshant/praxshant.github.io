/**
 * Portfolio API proxy.
 *
 * Holds the Groq and Hugging Face keys as Worker secrets (never in this
 * file, never in the browser) and forwards two routes:
 *
 *   POST /chat        -> Groq chat completions   (used by the Pokédex chatbot)
 *   POST /dog-breed    -> HF dog-breed classifier (used by the Dog AI section)
 *
 * Set secrets with:
 *   wrangler secret put GROQ_KEY
 *   wrangler secret put HF_KEY
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const HF_URL   = 'https://api-inference.huggingface.co/models/dima806/133_dog_breeds_image_detection';

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/** Retry fetching HF up to `maxTries` times when the model is loading (503). */
async function fetchHFWithRetry(hfKey, bodyBytes, maxTries = 3, delayMs = 4000) {
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const upstream = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfKey}`,
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'portfolio-proxy/1.0',
      },
      body: bodyBytes,
    });

    const rawText = await upstream.text();

    // 503 usually means the model is still loading
    if (upstream.status === 503) {
      if (attempt < maxTries) {
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return { ok: false, status: 503, body: JSON.stringify({ error: 'Model is still loading on Hugging Face — please wait 30 seconds and try again.' }) };
    }

    // Try to validate that it's actually JSON (HF sometimes returns HTML error pages)
    try {
      JSON.parse(rawText);
      return { ok: true, status: upstream.status, body: rawText };
    } catch {
      // Non-JSON response (e.g. Cloudflare HTML error page or HF HTML)
      return { ok: false, status: 502, body: JSON.stringify({ error: 'Received an unexpected response from the model API. Please try again.', detail: rawText.slice(0, 200) }) };
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    try {
      if (url.pathname === '/chat') {
        if (!env.GROQ_KEY) {
          return new Response(JSON.stringify({ error: 'GROQ_KEY not configured on the worker' }), {
            status: 500, headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        const upstream = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.GROQ_KEY}`,
          },
          body: await request.text(),
        });
        const data = await upstream.text();
        return new Response(data, {
          status: upstream.status,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      if (url.pathname === '/dog-breed') {
        if (!env.HF_KEY) {
          return new Response(JSON.stringify({ error: 'HF_KEY not configured on the worker' }), {
            status: 500, headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        const bodyBytes = await request.arrayBuffer();
        const result = await fetchHFWithRetry(env.HF_KEY, bodyBytes);
        return new Response(result.body, {
          status: result.status,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      return new Response('Not found', { status: 404, headers: cors });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Proxy error', detail: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  },
};
