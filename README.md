# Portfolio API Proxy (Cloudflare Worker)

Keeps your Groq and Hugging Face API keys off the public portfolio page.
The browser calls this worker; the worker calls Groq/HF with the real keys
attached server-side.

## 0. Rotate your old keys first

The keys that were previously hardcoded in `index.html` are compromised —
anyone who viewed source had them. Before doing anything else:

- Groq: https://console.groq.com/keys → revoke the old key, create a new one
- Hugging Face: https://huggingface.co/settings/tokens → revoke the old
  token, create a new one (read-only / inference is enough)

Use the **new** keys below. Never paste the old ones back in anywhere.

## 1. Install Wrangler (Cloudflare's CLI)

```bash
npm install -g wrangler
wrangler login
```

This opens a browser to log into (or create) a free Cloudflare account.

## 2. Deploy the worker

```bash
cd cloudflare-worker
wrangler secret put GROQ_KEY
# paste your new Groq key when prompted, press Enter

wrangler secret put HF_KEY
# paste your new Hugging Face token when prompted, press Enter

wrangler deploy
```

Wrangler will print a URL that looks like:

```
https://prashant-portfolio-proxy.<your-subdomain>.workers.dev
```

Copy that URL.

## 3. Point the portfolio at your worker

In `index.html`, find this line near the top of the main `<script>` block:

```js
const API_BASE = 'https://REPLACE-WITH-YOUR-WORKER-URL.workers.dev';
```

Replace it with the URL Wrangler printed. That's it — the chatbot
(`/chat`) and the dog-breed predictor (`/dog-breed`) both use `API_BASE`
automatically.

## 4. Check the allowed origin

`wrangler.toml` restricts CORS to `https://praxshant.github.io`. If you
serve the portfolio from a different domain, update `ALLOWED_ORIGIN`
there before deploying (or redeploy with `wrangler deploy` again after
editing it).

## 5. Test it

Open your deployed portfolio (not the local `file://` copy — CORS/relative
URLs behave differently there), open the chatbot bubble, and send a
message. Then try the Dog AI section with a photo. Both should now work
without any key ever appearing in your page source.

## Costs

Cloudflare Workers' free tier includes 100,000 requests/day, which is far
more than a portfolio site will ever use.
