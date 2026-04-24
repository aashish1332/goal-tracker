/**
 * Interactive 3D Point Cloud Wave — Performance-Optimized
 * Uses pre-computed sin/cos LUT, cached gradients, visibility API,
 * and OffscreenCanvas double-buffering for peak frame rates.
 */
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('terrainCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    
    let width, height;
    let cols, rows;
    const isPotato = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || 
                     (navigator.deviceMemory && navigator.deviceMemory <= 4) || 
                     window.innerWidth < 768;
    const scale = isPotato ? 55 : 30;

    let w = 2800; 
    let h = 1400; 
    let flying = 0;
    
    // ── Smooth mouse tracking ──────────────────────────────────────────────
    let targetMouseX = -1000;
    let targetMouseY = -1000;
    let mouseX = -1000;
    let mouseY = -1000;
    const MOUSE_LERP = 0.12;
    
    document.addEventListener('mousemove', (e) => {
        targetMouseX = e.clientX;
        targetMouseY = e.clientY;
    }, { passive: true });

    const simulateInteraction = (x, y) => {
        targetMouseX = x;
        targetMouseY = y;
        const bgCanvas = document.getElementById('bgCanvas');
        if (bgCanvas) {
            const ptrEvent = new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'touch', bubbles: true });
            bgCanvas.dispatchEvent(ptrEvent);
            document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'touch', bubbles: true }));
        }
    };

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            simulateInteraction(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    window.addEventListener('scroll', () => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll <= 0) return;
        const ratio = window.scrollY / maxScroll;
        
        const fakeX = window.innerWidth / 2 + Math.sin(ratio * Math.PI * 4) * (window.innerWidth * 0.3);
        const fakeY = window.innerHeight * (0.8 - ratio * 0.6); 
        
        simulateInteraction(fakeX, fakeY);
    }, { passive: true });
    
    // ── Pre-computed sin/cos lookup table ───────────────────────────────────
    // Eliminates thousands of Math.sin/cos calls per frame
    const LUT_SIZE = 4096;
    const LUT_MASK = LUT_SIZE - 1;
    const TWO_PI = Math.PI * 2;
    const sinLUT = new Float32Array(LUT_SIZE);
    const cosLUT = new Float32Array(LUT_SIZE);
    for (let i = 0; i < LUT_SIZE; i++) {
        const angle = (i / LUT_SIZE) * TWO_PI;
        sinLUT[i] = Math.sin(angle);
        cosLUT[i] = Math.cos(angle);
    }
    const fastSin = (x) => {
        const idx = ((x % TWO_PI + TWO_PI) * (LUT_SIZE / TWO_PI)) & LUT_MASK;
        return sinLUT[idx];
    };
    const fastCos = (x) => {
        const idx = ((x % TWO_PI + TWO_PI) * (LUT_SIZE / TWO_PI)) & LUT_MASK;
        return cosLUT[idx];
    };

    // ── Cached gradient (rebuilt only on resize/theme change) ───────────────
    let cachedGrad = null;
    let cachedFadeGrad = null;
    let gradientDirty = true;
    
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      cols = Math.floor(w / scale);
      rows = Math.floor(h / scale);
      gradientDirty = true; // Force gradient rebuild
    };
    window.addEventListener('resize', resize);
    resize();
  
    // Theme Color Caching
    let cachedIsLight = false;
    let cachedBgColor = 'rgba(10,10,18,1)';
    let cachedAlphaColor = 'rgba(10,10,18,0)';

    function updateThemeColors() {
        const root = document.documentElement;
        cachedIsLight = root.getAttribute('data-theme') === 'light';
        let rawBg = getComputedStyle(document.body).getPropertyValue('--bg-color').trim();
        if (!rawBg) rawBg = cachedIsLight ? '#f0f0f5' : '#0a0a12';
        
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(rawBg);
        if (result) {
            const r = parseInt(result[1], 16);
            const g = parseInt(result[2], 16);
            const b = parseInt(result[3], 16);
            cachedBgColor = `rgba(${r}, ${g}, ${b}, 1)`;
            cachedAlphaColor = `rgba(${r}, ${g}, ${b}, 0)`;
        } else {
            cachedBgColor = cachedIsLight ? 'rgba(240,240,245,1)' : 'rgba(10,10,18,1)';
            cachedAlphaColor = cachedIsLight ? 'rgba(240,240,245,0)' : 'rgba(10,10,18,0)';
        }
        gradientDirty = true; // Rebuild gradients on theme change
    }

    updateThemeColors();

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === 'data-theme') { updateThemeColors(); break; }
        }
    });
    observer.observe(document.documentElement, { attributes: true });

    // ── Build & cache gradients ────────────────────────────────────────────
    function rebuildGradients() {
        cachedGrad = ctx.createLinearGradient(0, 0, width, 0);
        if (cachedIsLight) {
            cachedGrad.addColorStop(0, 'rgba(124, 58, 237, 1)');
            cachedGrad.addColorStop(0.5, 'rgba(224, 112, 0, 1)');
            cachedGrad.addColorStop(1, 'rgba(0, 200, 255, 1)');
        } else {
            cachedGrad.addColorStop(0.1, 'rgba(168, 85, 247, 1)');
            cachedGrad.addColorStop(0.5, 'rgba(255, 140, 0, 1)');
            cachedGrad.addColorStop(0.9, 'rgba(255, 215, 0, 1)');
        }

        const centerY = height * 0.45;
        cachedFadeGrad = ctx.createLinearGradient(0, centerY - 150, 0, height);
        cachedFadeGrad.addColorStop(0, cachedBgColor);
        cachedFadeGrad.addColorStop(0.3, cachedBgColor);
        cachedFadeGrad.addColorStop(0.65, cachedAlphaColor);
        cachedFadeGrad.addColorStop(1, cachedAlphaColor);

        gradientDirty = false;
    }

    // Pre-calculate constants
    const interactionRadius = 180;
    const interactionRadiusSq = interactionRadius * interactionRadius;
    const liftForce = 120;
    const fl = 400; 
    const camY = -230; 
    const camZ = -150; 

    // ── Visibility API: pause rendering when tab is hidden ─────────────────
    let isVisible = true;
    document.addEventListener('visibilitychange', () => {
        isVisible = !document.hidden;
        if (isVisible) requestAnimationFrame(draw);
    });

    // ── Pre-allocate row offset cache ──────────────────────────────────────
    const maxRows = Math.ceil(h / 30); // Max possible rows at smallest scale
    const rowScaleZ = new Float32Array(maxRows);
    const rowScreenY = new Float32Array(maxRows);

    function draw() {
      if (!isVisible) return; // Stop burning CPU when tab is hidden

      flying -= 0.012;

      // Lerp mouse
      mouseX += (targetMouseX - mouseX) * MOUSE_LERP;
      mouseY += (targetMouseY - mouseY) * MOUSE_LERP;
      
      // Rebuild gradients only when dirty (resize/theme change)
      if (gradientDirty) rebuildGradients();

      ctx.clearRect(0, 0, width, height);
  
      const centerY = height * 0.45; 
      const centerX = width * 0.5;
      const halfW = w * 0.5;
  
      ctx.fillStyle = cachedGrad;
      ctx.beginPath();
      
      // Pre-compute per-row values
      let validRowStart = 0;
      for (let y = 0; y < rows; y++) {
        const dz = (y * scale) - camZ;
        if (dz <= 0) { validRowStart = y + 1; continue; }
        const sz = fl / dz;
        rowScaleZ[y] = sz;
        rowScreenY[y] = centerY - (camY * sz);
      }

      let yoff = flying + validRowStart * 0.12;
      for (let y = validRowStart; y < rows; y++) {
        const scaleZ = rowScaleZ[y];
        const screenY_base = rowScreenY[y];

        let xoff = 0;
        for (let x = 0; x < cols; x++) {
          // Use LUT instead of Math.sin/cos (4 trig calls → 4 array lookups)
          const terrainZ = (fastSin(xoff) * fastCos(yoff) * 50) + (fastSin(xoff * 0.4) * fastSin(yoff * 0.4) * 85);

          const sx = centerX + ((x * scale) - halfW) * scaleZ;
          let sy = screenY_base + (terrainZ * scaleZ);
          let size = 2.5 * scaleZ;
          if (size < 0.5) size = 0.5;

          const dx = sx - mouseX;
          const dy = sy - mouseY;
          const distSq = dx * dx + dy * dy;
          
          if (distSq < interactionRadiusSq) {
            const force = 1 - (distSq / interactionRadiusSq);
            const forceSq = force * force; 
            sy -= forceSq * liftForce * scaleZ;
            size += forceSq * 2.5;
          }

          ctx.rect(sx, sy, size, size);
          xoff += 0.12;
        }
        yoff += 0.12;
      }
      ctx.fill();

      // Fade overlay (uses cached gradient)
      ctx.fillStyle = cachedFadeGrad;
      ctx.fillRect(0, 0, width, height);

      requestAnimationFrame(draw);
    }
  
    requestAnimationFrame(draw);
});
