// /assets/widget.js
(function () {
  const LOG = (...a) => { try { console.debug('[vchat]', ...a); } catch {} };

  // Create (or return) the rail, tile, and iframe
  function ensureOverlay() {
    // Ensure CSS (in case proxy didn't inject <link>)
    if (!document.querySelector('link[href="/assets/overlay.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/assets/overlay.css';
      document.head.appendChild(css);
      LOG('overlay.css added');
    }

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
      tile.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12c0 3.866-3.806 7-8.5 7-1.01 0-1.967-.147-2.85-.42L5 20l1.61-3.034C5.615 15.864 5 14.49 5 13c0-3.866 3.806-7 8.5-7S21 8.134 21 12Z"/>
          <circle cx="10" cy="12" r="1.2"/><circle cx="13.5" cy="12" r="1.2"/><circle cx="17" cy="12" r="1.2"/>
        </svg>
        <span>Chat-Hilfe</span>
      `;
      rail.prepend(tile);
      LOG('tile created');

      tile.addEventListener('click', function(){
        frame.style.display = (frame.style.display === 'none' || frame.style.display === '') ? 'block' : 'none';
      });
      // Allow iframe to close itself
      window.addEventListener('message', (e) => { if (e && e.data === 'vchat-close') frame.style.display = 'none'; });
    }

    // Make sure it’s on top and clickable
    rail.style.zIndex = '2147483647';
    rail.style.pointerEvents = 'auto';
  }

  // Wait for body, then inject
  function onReady(cb){
    if (document.readyState !== 'loading') cb();
    else document.addEventListener('DOMContentLoaded', cb);
  }

  onReady(function(){
    if (window.__vchat_booted__) return;
    window.__vchat_booted__ = true;

    // First pass
    ensureOverlay();

    // MutationObserver: re-inject if theme/Elementor re-renders
    const mo = new MutationObserver(() => {
      // If our rail or frame vanished, bring them back
      if (!document.getElementById('vchat-rail') || !document.querySelector('.vchat-frame')) {
        LOG('rebuilding overlay after DOM change');
        ensureOverlay();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Also retry a few times during heavy async loads
    let retries = 0;
    const tick = setInterval(() => {
      ensureOverlay();
      if (++retries > 10) clearInterval(tick);
    }, 500);

    LOG('widget booted');
  });
})();
