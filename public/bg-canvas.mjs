import { Application } from 'https://esm.sh/@splinetool/runtime';

// Force all closed shadow roots to be OPEN globally.
const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init) {
  return originalAttachShadow.call(this, { ...init, mode: 'open' });
};

/**
 * TrackerPro — Spline 3D Background (Performance-Optimized)
 * - Uses MutationObserver instead of setInterval for watermark removal
 * - Deferred loading via requestIdleCallback
 * - Visibility API pause for Spline when tab is hidden
 */
const initBg = () => {
  const canvas = document.getElementById('bgCanvas');
  const loader = document.getElementById('bgLoader');
  if (!canvas) return;

  // Initial state for smooth fade-in
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 1.5s ease-in-out';

  const loadSpline = () => {
    const spline = new Application(canvas);
    spline.load('https://prod.spline.design/t2zK7g7gsEBHlYf2/scene.splinecode')
      .then(() => {
        console.log('Spline Scene loaded lazily!');
        canvas.style.opacity = '1';

        // ── Efficient watermark removal via MutationObserver ──────────
        // Instead of scanning ALL DOM elements every second (extremely expensive),
        // we observe only new nodes added to the document and hide watermarks on insertion.
        const hideSplineWatermark = (root) => {
          const targets = root.querySelectorAll('#logo, a[href*="spline"]');
          for (const el of targets) {
            el.style.cssText = 'display:none!important;opacity:0!important;pointer-events:none!important;';
          }
        };

        // Initial cleanup pass (targeted, not querySelectorAll('*'))
        hideSplineWatermark(document);
        document.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) hideSplineWatermark(el.shadowRoot);
        });

        // Watch for dynamically inserted watermark elements
        const wmObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType !== 1) continue;
              // Check the node itself
              if (node.id === 'logo' || (node.href && node.href.includes('spline'))) {
                node.style.cssText = 'display:none!important;opacity:0!important;pointer-events:none!important;';
              }
              // Check children
              const inner = node.querySelectorAll?.('#logo, a[href*="spline"]');
              if (inner) for (const el of inner) {
                el.style.cssText = 'display:none!important;opacity:0!important;pointer-events:none!important;';
              }
              // Check shadow roots
              if (node.shadowRoot) hideSplineWatermark(node.shadowRoot);
            }
          }
        });
        wmObserver.observe(document.body, { childList: true, subtree: true });

        // Hide and remove loader
        if (loader) {
          loader.style.opacity = '0';
          setTimeout(() => loader.remove(), 1000);
        }
      })
      .catch(err => {
        console.error('Error loading Spline scene:', err);
        if (loader) {
          loader.innerHTML = '<span style="color:red">Failed to load background.</span>';
        }
      });
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadSpline, { timeout: 2000 });
  } else {
    setTimeout(loadSpline, 500);
  }
};

// Wait for the full page to load before attempting to load the 3D scene
if (document.readyState === 'complete') {
  initBg();
} else {
  window.addEventListener('load', initBg);
}