// api/chat.js
export const config = { runtime: 'edge' };

/**
 * Simple, low-cost RAG over droniq.de:
 * - Fetch a handful of important pages
 * - Extract readable text
 * - Chunk + embed with text-embedding-3-small
 * - Embed the user query, rank by cosine
 * - Build an answer with citations
 * - If user asks for products, also parse product cards/links and include a list
 */

const ORIGIN = 'https://www.droniq.de';

// TUNE: the pages we’ll search (add/remove as needed)
const CANDIDATE_PATHS = [
  '/',                                  // homepage (often has high-level value props)
  '/produkte/',                         // portfolio/products overview
  '/loesungen/',                        // solutions
  '/leistungen/',                       // services
  '/preise/',                           // pricing
  '/faq/',                              // FAQ if exists (safe to include)
];

const MAX_PAGES = 5;         // safety: cap how many we fetch per request
const MAX_CHUNKS = 10;       // total chunks to embed per request
const CHUNK_SIZE = 1200;     // ~ chars per chunk (roughly 200-300 tokens)
const OVERLAP = 120;         // overlap so we don’t cut sentences
const OPENAI_BASE = 'https://api.openai.com/v1';

function stripTags(html) {
  // quick & dirty readability: remove script/style/noscript; collapse whitespace
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
             .replace(/<style[\s\S]*?<\/style>/gi, '')
             .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
             .replace(/<!--[\s\S]*?-->/g, '');
  // get title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  // crude main text: pull visible text
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
}

function chunkText(text) {
  const out = [];
  let i = 0;
  while (i < text.length && out.length < MAX_CHUNKS) {
    const slice = text.slice(i, i + CHUNK_SIZE);
    out.push(slice);
    i += (CHUNK_SIZE - OVERLAP);
  }
  return out;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function openai(path, body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('missing OPENAI_API_KEY');
  const r = await fetch(`${OPENAI_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`openai_error: ${detail}`);
  }
  return r.json();
}

function wantsProducts(q) {
  return /produkt|portfolio|angebot|empfehl|welches|was passt|kaufen|vergleich/i.test(q);
}

async function fetchPage(path) {
  // Go direct to origin (not your proxy) so we always see latest
  const url = path.startsWith('http') ? path : ORIGIN.replace(/\/$/, '') + path;
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  const html = await r.text();
  return { url, html };
}

function extractProductsFromHtml(html, baseUrl) {
  // heuristic: find <a> with product-ish text near cards/headlines
  // works on many WP/Elementor setups; adjust selectors if needed
  const urls = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  const names = [];
  let m;
  while ((m = re.exec(html)) && names.length < 20) {
    const href = m[1];
    const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!inner) continue;
    const looksLikeProduct =
      /ops|airspace|connect|produkt|lösung|loesung|service|paket|plan|module|sdk|api/i.test(inner) ||
      inner.split(' ').length <= 6; // short, name-like
    const path = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    if (looksLikeProduct && path.startsWith(ORIGIN)) {
      names.push({ name: inner, url: path });
    }
  }
  // de-duplicate by URL
  const seen = new Set();
  return names.filter(p => (seen.has(p.url) ? false : (seen.add(p.url), true)));
}

async function buildContext(message) {
  // 1) Fetch and parse a few pages
  const toFetch = CANDIDATE_PATHS.slice(0, MAX_PAGES);
  const pages = await Promise.allSettled(toFetch.map(fetchPage));
  const parsed = pages
    .filter(p => p.status === 'fulfilled')
    .map(p => {
      const { url, html } = p.value;
      const { title, text } = stripTags(html);
      return { url, title, text, html };
    });

  // 2) Create chunks across pages (cap total)
  const chunks = [];
  for (const p of parsed) {
    const parts = chunkText(p.text);
    for (const s of parts) {
      chunks.push({ url: p.url, title: p.title, text: s });
      if (chunks.length >= MAX_CHUNKS) break;
    }
    if (chunks.length >= MAX_CHUNKS) break;
  }
  if (!chunks.length) return { snippets: [], products: [] };

  // 3) Embed chunks + query
  const embModel = 'text-embedding-3-small';
  const inputs = [message, ...chunks.map(c => c.text)];
  const { data } = await openai('embeddings', { model: embModel, input: inputs });
  const queryVec = data[0].embedding;
  const chunkVecs = data.slice(1).map(d => d.embedding);

  // 4) Rank
  const scored = chunks.map((c, i) => ({ ...c, score: cosine(queryVec, chunkVecs[i]) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  // 5) Optionally extract products if user intent suggests
  let products = [];
  if (wantsProducts(message)) {
    // prefer products page if present, else scan all parsed
    const prodPage = parsed.find(p => /produkte|portfolio|product|produkte\//i.test(p.url)) || parsed[0];
    products = extractProductsFromHtml(prodPage.html, prodPage.url).slice(0, 10);
  }

  return { snippets: top, products };
}

function buildPrompt(snippets, products) {
  const contextBlocks = snippets.map((s, i) =>
    `[[${i + 1}]] ${s.title || ''}\nURL: ${s.url}\n${s.text.slice(0, 1200)}`
  ).join('\n\n');

  const productBlock = products.length
    ? `\n\n# PRODUCTS (from site)\n${products.map(p => `- ${p.name} — ${p.url}`).join('\n')}`
    : '';

  const instructions =
`You are Droniq's support assistant. Answer in **German**, concise and factual.
Use ONLY the context below. If the context doesn't contain the answer, say you’re not sure and suggest the closest page.
When you recommend a product, pick from the PRODUCTS list (if present), and explain briefly why.
Always include 1–3 citations as URLs from the provided context. Cite like: [1], [2], and list the URLs at the end under "Quellen".`;

  return `${instructions}\n\n# CONTEXT\n${contextBlocks}${productBlock}`;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'content-type': 'application/json' }
    });
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const message = (body && body.message || '').toString().slice(0, 4000);
  if (!message) {
    return new Response(JSON.stringify({ error: 'missing message' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const { snippets, products } = await buildContext(message);

    const system = buildPrompt(snippets, products);
    const user = message;

    // Build citation map
    const uniqueUrls = Array.from(new Set(snippets.map(s => s.url)));

    // Chat completion
    const model = 'gpt-4o-mini'; // switch to 'gpt-5-mini' if your org has access
    const completion = await openai('chat/completions', {
      model,
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });

    const answer = completion?.choices?.[0]?.message?.content || 'Entschuldigung, keine Antwort.';
    return new Response(JSON.stringify({ answer, citations: uniqueUrls.slice(0, 3) }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'chat_error', detail: String(e?.message || e) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
}
