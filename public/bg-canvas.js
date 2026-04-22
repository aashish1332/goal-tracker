import { Application } from 'https://esm.sh/@splinetool/runtime';

// God-tier hack: Force all closed shadow roots to be OPEN globally.
// This prevents Spline from hiding the watermark inside a locked DOM.
const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init) {
  return originalAttachShadow.call(this, { ...init, mode: 'open' });
};

/**
 * TrackerPro — Spline 3D Background
 * Implemented lazy loading to increase performance and prevent blocking the underlying canvas terrain.
 */
const initBg = () => {
  const canvas = document.getElementById('bgCanvas');
  const loader = document.getElementById('bgLoader');
  if (!canvas) return;

  // Initial state for smooth fade-in
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 1.5s ease-in-out';

  // We use requestIdleCallback to ensure the heavy Spline scene
  // only loads when the browser's main thread is idle, freeing up
  // resources for the HTML5 canvas terrain grid to render instantly.
  const loadSpline = () => {
    const spline = new Application(canvas);
    spline.load('https://prod.spline.design/t2zK7g7gsEBHlYf2/scene.splinecode')
      .then(() => {
        console.log('Spline Scene loaded lazily!');
        // Fade in canvas
        canvas.style.opacity = '1';

        // Aggressively hunt and destroy the Spline watermark (even inside Shadow DOM)
        const hideWatermark = () => {
          document.querySelectorAll('*').forEach(el => {
            if (el.id === 'logo' || (el.href && el.href.includes('spline'))) {
              el.style.display = 'none';
              el.style.opacity = '0';
              el.style.pointerEvents = 'none';
            }
            if (el.shadowRoot) {
              const shadowLogo = el.shadowRoot.getElementById('logo') || el.shadowRoot.querySelector('a[href*="spline.design"]');
              if (shadowLogo) {
                shadowLogo.style.display = 'none';
                shadowLogo.style.opacity = '0';
                shadowLogo.style.pointerEvents = 'none';
              }
            }
          });
        };
        
        hideWatermark();
        setInterval(hideWatermark, 1000);

        // Hide and remove loader
        if (loader) {
          loader.style.opacity = '0';
          setTimeout(() => loader.remove(), 1000); // Wait for transition
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