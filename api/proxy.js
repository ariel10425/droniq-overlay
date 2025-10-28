// api/proxy.js
export const config = { runtime: 'edge' };

const ORIGIN = 'https://www.droniq.de';

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const path = url.pathname + url.search;

    // Pass through the UA; add anything else you need (cookies not needed)
    const upstream = await fetch(ORIGIN + path, {
      headers: {
        'user-agent': req.headers.get('user-agent') || 'Mozilla/5.0'
      }
    });

    // Clone headers and relax anything that could block our overlay
    const hdrs = new Headers(upstream.headers);

    // Remove CSP headers so our injected script can execute
    hdrs.delete('content-security-policy');
    hdrs.delete('content-security-policy-report-only');

    // We are about to change the body, so remove enc/length to avoid mismatch
    hdrs.delete('content-encoding');
    hdrs.delete('content-length');

    hdrs.set('x-proxied-by', 'vercel-edge');

    const ctype = (hdrs.get('content-type') || '').toLowerCase();

    if (ctype.includes('text/html')) {
      let html = await upstream.text();

      // Remove any meta CSP tag present in the HTML
      html = html.replace(
        /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi,
        ''
      );

      // Inject our overlay just before </body>, or append at the end if not found
      const injectTag = `<script src="/assets/widget.js"></script>`;
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `${injectTag}</body>`);
      } else {
        html = html + injectTag;
      }

      return new Response(html, {
        status: upstream.status,
        headers: hdrs
      });
    }

    // Non-HTML: stream as-is
    return new Response(upstream.body, {
      status: upstream.status,
      headers: hdrs
    });
  } catch (e) {
    return new Response('Proxy error', { status: 502 });
  }
}
