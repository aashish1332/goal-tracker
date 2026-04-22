/**
 * Interactive 3D Point Cloud Wave
 * Replaces linear terrain wireframes with highly optimized reactive dots.
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
    const scale = isPotato ? 55 : 30; // Less dense for potato PCs, denser for high-end

    // Total virtual 3D size 
    let w = 2800; 
    let h = 1400; 
    let flying = 0;
    
    let mouseX = -1000;
    let mouseY = -1000;
    
    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      cols = Math.floor(w / scale);
      rows = Math.floor(h / scale);
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
    }

    updateThemeColors();

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
            if (m.attributeName === 'data-theme') updateThemeColors();
        });
    });
    observer.observe(document.documentElement, { attributes: true });

    // Pre-calculate constants
    const interactionRadius = 180;
    const interactionRadiusSq = interactionRadius * interactionRadius;
    const liftForce = 120;
    const fl = 400; 
    const camY = -230; 
    const camZ = -150; 

    function draw() {
      flying -= 0.012;
      
      ctx.clearRect(0, 0, width, height);
  
      const centerY = height * 0.45; 
      const centerX = width / 2;
  
      // 1. Sweeping Neon Gradient
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      if (cachedIsLight) {
          grad.addColorStop(0, 'rgba(124, 58, 237, 1)');
          grad.addColorStop(0.5, 'rgba(224, 112, 0, 1)');
          grad.addColorStop(1, 'rgba(0, 200, 255, 1)');
      } else {
          grad.addColorStop(0.1, 'rgba(168, 85, 247, 1)');
          grad.addColorStop(0.5, 'rgba(255, 140, 0, 1)');
          grad.addColorStop(0.9, 'rgba(255, 215, 0, 1)');
      }
  
      ctx.fillStyle = grad;
      ctx.beginPath();
      
      let yoff = flying;
      for (let y = 0; y < rows; y++) {
        const dz = (y * scale) - camZ;
        if (dz <= 0) {
            yoff += 0.12;
            continue;
        }
        const scaleZ = fl / dz;
        const screenY_base = centerY - (camY * scaleZ);

        let xoff = 0;
        for (let x = 0; x < cols; x++) {
          const terrainZ = (Math.sin(xoff) * Math.cos(yoff) * 50) + (Math.sin(xoff*0.4) * Math.sin(yoff*0.4) * 85); 

          const sx = centerX + ((x * scale) - (w / 2)) * scaleZ;
          let sy = screenY_base + (terrainZ * scaleZ);
          let size = Math.max(0.5, 2.5 * scaleZ);

          const dx = sx - mouseX;
          const dy = sy - mouseY;
          const distSq = dx*dx + dy*dy;
          
          if (distSq < interactionRadiusSq) {
            // God-tier optimization: Parabolic falloff without Math.sqrt()
            const force = 1 - (distSq / interactionRadiusSq);
            // forceSq makes the lift sharper at the center of the mouse
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

      // 2. Optical Y-Axis Fade Out
      const fadeGrad = ctx.createLinearGradient(0, centerY - 150, 0, height);
      fadeGrad.addColorStop(0, cachedBgColor);
      fadeGrad.addColorStop(0.3, cachedBgColor);
      fadeGrad.addColorStop(0.65, cachedAlphaColor);
      fadeGrad.addColorStop(1, cachedAlphaColor);

      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, 0, width, height);

      requestAnimationFrame(draw);
    }
  
    requestAnimationFrame(draw);
});
