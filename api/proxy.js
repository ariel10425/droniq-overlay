// api/proxy.js
export const config = { runtime: 'edge' };

const ORIGIN = 'https://www.droniq.de';

// Replace absolute droniq URLs with relative (so the browser hits our domain)
function rewriteAbsoluteToRelativeHtml(html) {
  // handles https://droniq.de, https://www.droniq.de, http://*, and //www.droniq.de
  return html
    .replace(/https?:\/\/(?:www\.)?droniq\.de/gi, '')
    .replace(/\/\/(?:www\.)?droniq\.de/gi, '');
}
function rewriteAbsoluteToRelativeCss(css) {
  return css
    .replace(/url\(["']?https?:\/\/(?:www\.)?droniq\.de/gi, 'url(')
    .replace(/url\(["']?\/\/(?:www\.)?droniq\.de/gi, 'url(');
}

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const path = url.pathname + url.search;

    // Fetch upstream
    const upstream = await fetch(ORIGIN + path, {
      headers: {
        'user-agent': req.headers.get('user-agent') || 'Mozilla/5.0',
        'accept': req.headers.get('accept') || '*/*',
      }
    });

    const hdrs = new Headers(upstream.headers);

    // We might mutate bodies → drop these to avoid mismatch
    hdrs.delete('content-encoding');
    hdrs.delete('content-length');

    // Relax CSP so our overlay can load
    hdrs.delete('content-security-policy');
    hdrs.delete('content-security-policy-report-only');

    hdrs.set('x-proxied-by', 'vercel-edge');

    const ctype = (hdrs.get('content-type') || '').toLowerCase();

    // ---- HTML: rewrite + inject widget ----
    if (ctype.includes('text/html')) {
      let html = await upstream.text();

      // Remove any meta CSP tag
      html = html.replace(
        /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi,
        ''
      );

      // Rewrite absolute droniq.de URLs to relative (avoid CORS)
      html = rewriteAbsoluteToRelativeHtml(html);

      // Inject our overlay assets
      const inject = `
        <link rel="stylesheet" href="/assets/overlay.css">
        <script>window.__vchat_injected_from_proxy__=true;</script>
        <script src="/assets/widget.js" defer></script>
      `;
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, inject + '</body>');
      } else {
        html += inject;
      }

      return new Response(html, { status: upstream.status, headers: hdrs });
    }

    // ---- CSS: rewrite url(https://droniq.de/...) → url(/...) to avoid CORS
    if (ctype.includes('text/css')) {
      let css = await upstream.text();
      css = rewriteAbsoluteToRelativeCss(css);
      return new Response(css, { status: upstream.status, headers: hdrs });
    }

    // Other content-types: stream as-is
    return new Response(upstream.body, { status: upstream.status, headers: hdrs });
  } catch (e) {
    return new Response('Proxy error', { status: 502 });
  }
}
