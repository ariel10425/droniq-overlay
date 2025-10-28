export const config = { runtime: 'edge' };
const ORIGIN='https://www.droniq.de';
export default async function handler(req){
  try{
    const url=new URL(req.url); const path=url.pathname+url.search;
    const upstream=await fetch(ORIGIN+path,{headers:{'user-agent':req.headers.get('user-agent')||'Mozilla/5.0'}});
    const hdrs=new Headers(upstream.headers);
    hdrs.delete('content-security-policy'); hdrs.delete('content-security-policy-report-only'); hdrs.set('x-proxied-by','vercel-edge');
    const ctype=hdrs.get('content-type')||'';
    if(ctype.includes('text/html')){
      const html=await upstream.text();
      const injected=html.replace(/</body>/i, `<script src="/assets/widget.js"></script></body>`);
      return new Response(injected,{status:upstream.status,headers:hdrs});
    }
    return new Response(upstream.body,{status:upstream.status,headers:hdrs});
  }catch(e){ return new Response('Proxy error',{status:502}); }
}