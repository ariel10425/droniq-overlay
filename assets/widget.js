// ====== Droniq chat overlay – robust injector + auto-align ======
(function () {
  const LOG = (...a) => { try { console.debug('[vchat]', ...a); } catch {} };

  function ensureCss() {
    if (!document.querySelector('link[href="/assets/overlay.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/assets/overlay.css';
      document.head.appendChild(css);
      LOG('overlay.css added');
    }
  }

  function makeTileHtml(){
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12c0 3.866-3.806 7-8.5 7-1.01 0-1.967-.147-2.85-.42L5 20l1.61-3.034C5.615 15.864 5 14.49 5 13c0-3.866 3.806-7 8.5-7S21 8.134 21 12Z"/>
        <circle cx="10" cy="12" r="1.2"/><circle cx="13.5" cy="12" r="1.2"/><circle cx="17" cy="12" r="1.2"/>
      </svg>
      <span>Chat-Hilfe</span>
    `;
  }

  // Create (or return) rail + tile + iframe
  function ensureOverlay() {
    ensureCss();

    let rail = document.getElementById('vchat-rail');
    if (!rail) {
      rail = document.createElement('div');
      rail.id = 'vchat-rail';
      document.body.appendChild(rail);
      LOG('rail created');
    }

    let frame = document.querySelector('.vchat-frame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'vchat-frame';
      frame.title = 'Droniq Chat-Hilfe';
      frame.src = '/chat/index.html';
      document.body.appendChild(frame);
      LOG('frame created');
    }

    let tile = rail.querySelector('.vchat-tile');
    if (!tile) {
      tile = document.createElement('button');
      tile.className = 'vchat-tile';
      tile.setAttribute('aria-label', 'Chat-Hilfe öffnen');
      tile.innerHTML = makeTileHtml();
      rail.prepend(tile); // put on top
      LOG('tile created');

      tile.addEventListener('click', function(){
        frame.style.display = (frame.style.display === 'none' || frame.style.display === '') ? 'block' : 'none';
      });
      // Allow iframe to close itself
      window.addEventListener('message', (e) => { if (e && e.data === 'vchat-close') frame.style.display = 'none'; });
    }

    // safety: keep on top
    rail.style.zIndex = '2147483647';
    rail.style.pointerEvents = 'auto';

    return { rail, frame };
  }

  // Auto-align our rail to the existing support stack on the right
  function autoAlignToExisting(rail){
    try {
      const candidates = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed') return false;
          const r = el.getBoundingClientRect();
          // Heuristic for the existing tile buttons
          const sizeMatch = r.width >= 120 && r.width <= 170 && r.height >= 60 && r.height <= 110;
          const nearRight = (window.innerWidth - r.right) <= 40; // within 40px of right edge
          const bg = cs.backgroundColor.replace(/\s+/g,'').toLowerCase();
          const looksAqua = bg === 'rgb(207,232,234)'.replace(/\s+/g,'') || bg.includes('207,232,234');
          return sizeMatch && nearRight && looksAqua;
        });

      if (candidates.length) {
        // choose the top-most one (smallest top value)
        candidates.sort((a,b)=> a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        const anchor = candidates[0];
        const ar = anchor.getBoundingClientRect();
        rail.style.right = (window.innerWidth - ar.right) + 'px';
        rail.style.top   = Math.max(16, Math.round(ar.top)) + 'px';
        LOG('aligned to existing rail at', rail.style.right, rail.style.top);
        return true;
      }
    } catch(e){ /* ignore */ }
    return false;
  }

  // Boot once DOM is ready; then keep overlay alive across reflows
  function boot(){
    if (window.__vchat_booted__) return;
    window.__vchat_booted__ = true;

    const { rail } = ensureOverlay();
    // try to align now and also after late-load elements appear
    if (!autoAlignToExisting(rail)) {
      LOG('alignment: fallback position used');
    }
    let tries = 0;
    const alignTimer = setInterval(()=>{
      if (autoAlignToExisting(rail) || ++tries > 8) clearInterval(alignTimer);
    }, 600);

    // MutationObserver: rebuild if DOM rewrites remove our nodes
    const mo = new MutationObserver(() => {
      const hasRail = !!document.getElementById('vchat-rail');
      const hasFrame = !!document.querySelector('.vchat-frame');
      if (!hasRail || !hasFrame) {
        LOG('rebuilding overlay after DOM change');
        const { rail: r } = ensureOverlay();
        autoAlignToExisting(r);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    LOG('widget booted');
  }

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
