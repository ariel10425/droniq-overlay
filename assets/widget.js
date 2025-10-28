<script>
(function () {
  function ready(cb){ if (document.readyState !== 'loading') cb(); else document.addEventListener('DOMContentLoaded', cb); }

  ready(function(){
    if (window.__vchat_injected__) return; window.__vchat_injected__ = true;

    // Ensure CSS is loaded
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/assets/overlay.css';
    document.head.appendChild(css);

    // --- Rail container ---
    var rail = document.createElement('div');
    rail.id = 'vchat-rail';
    document.body.appendChild(rail);

    // --- Our new top tile: Chat-Hilfe ---
    var tile = document.createElement('button');
    tile.className = 'vchat-tile';
    tile.setAttribute('aria-label', 'Chat-Hilfe öffnen');

    // Inline chat icon (speech bubble with dots) to match the line-icon style
    tile.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12c0 3.866-3.806 7-8.5 7-1.01 0-1.967-.147-2.85-.42L5 20l1.61-3.034C5.615 15.864 5 14.49 5 13c0-3.866 3.806-7 8.5-7S21 8.134 21 12Z"/>
        <circle cx="10" cy="12" r="1.2"/>
        <circle cx="13.5" cy="12" r="1.2"/>
        <circle cx="17" cy="12" r="1.2"/>
      </svg>
      <span>Chat-Hilfe</span>
    `;
    rail.appendChild(tile);

    // --- The iframe panel (chat window) ---
    var frame = document.createElement('iframe');
    frame.src = '/chat/index.html';
    frame.title = 'Droniq Chat-Hilfe';
    frame.className = 'vchat-frame';
    document.body.appendChild(frame);

    // Toggle open/close
    tile.addEventListener('click', function(){
      frame.style.display = (frame.style.display === 'none' || frame.style.display === '') ? 'block' : 'none';
    });

    // Allow close from inside the iframe via postMessage
    window.addEventListener('message', function(e){
      if (e && e.data === 'vchat-close') frame.style.display = 'none';
    });
  });
})();
</script>
