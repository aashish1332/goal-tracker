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
    const scale = 30; // Dense particle distribution
    
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
  
    let terrain = [];
    for (let x = 0; x < cols; x++) {
      terrain[x] = [];
      for (let y = 0; y < rows; y++) {
        terrain[x][y] = 0;
      }
    }
  
    // Helper to extract base theme hex into rgba strings
    function getThemeRgba(alpha) {
      let rawBg = getComputedStyle(document.body).getPropertyValue('--bg-color').trim();
      if (!rawBg) rawBg = '#0a0a12'; // Fallback dark space
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(rawBg);
      return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})` : `rgba(10,10,18,${alpha})`;
    }

    function draw() {
      flying -= 0.012; // Smooth flowing motion
      
      let yoff = flying;
      for (let y = 0; y < rows; y++) {
        let xoff = 0;
        for (let x = 0; x < cols; x++) {
          // Complex fractal noise generation for organic rolling waves
          terrain[x][y] = (Math.sin(xoff) * Math.cos(yoff) * 50) + (Math.sin(xoff*0.4) * Math.sin(yoff*0.4) * 85); 
          xoff += 0.12;
        }
        yoff += 0.12;
      }
  
      ctx.clearRect(0, 0, width, height);
  
      const fl = 400; 
      const camY = -230; 
      const camZ = -150; 
      const centerY = height * 0.45; 
      const centerX = width / 2;
  
      // 1. Horizontal Sweeping Neon Gradient
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      if (isLight) {
          grad.addColorStop(0, 'rgba(124, 58, 237, 1)');
          grad.addColorStop(0.5, 'rgba(224, 112, 0, 1)');
          grad.addColorStop(1, 'rgba(0, 200, 255, 1)');
      } else {
          grad.addColorStop(0.1, 'rgba(168, 85, 247, 1)'); // Synth Purple
          grad.addColorStop(0.5, 'rgba(255, 140, 0, 1)');  // Neon Orange
          grad.addColorStop(0.9, 'rgba(255, 215, 0, 1)');   // Cyber Gold
      }
  
      // Massive render batching for dots
      ctx.fillStyle = grad;
      ctx.beginPath();
      
      const interactionRadius = 180;
      const liftForce = 120; // How high points bounce on mouse hover

      for (let y = 0; y < rows; y++) {
        const dz = (y * scale) - camZ;
        if (dz <= 0) continue;
        const scaleZ = fl / dz;
        const screenY_base = centerY - (camY * scaleZ);

        for (let x = 0; x < cols; x++) {
          const sx = centerX + ((x * scale) - (w / 2)) * scaleZ;
          let sy = screenY_base + (terrain[x][y] * scaleZ);
          let size = Math.max(0.5, 2.5 * scaleZ);

          // Magnetic Mouse Physics Engine
          const dx = sx - mouseX;
          const dy = sy - mouseY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < interactionRadius) {
            const force = Math.pow((interactionRadius - dist) / interactionRadius, 2); // Ease-in curve
            sy -= force * liftForce * scaleZ; // Lift dots physically up based on depth scale
            size += force * 2.5; // Expand glow footprint dynamically
          }

          // Use rect for god-tier performance over 10,000+ geometric objects
          ctx.rect(sx, sy, size, size);
        }
      }
      ctx.fill();

      // 2. Optical Y-Axis Fade Out (Depth Of Field Simulation)
      const bgColor = getThemeRgba(1);
      const alphaColor = getThemeRgba(0);
      const fadeGrad = ctx.createLinearGradient(0, centerY - 150, 0, height);
      
      fadeGrad.addColorStop(0, bgColor);           // Absolute hiding far beyond vanishing point 
      fadeGrad.addColorStop(0.3, bgColor);         // Smooths distant rendering collisions
      fadeGrad.addColorStop(0.65, alphaColor);     // Reveals midground majestic rolling waves
      fadeGrad.addColorStop(1, alphaColor);        // Transparent nearest camera

      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, 0, width, height);

      requestAnimationFrame(draw);
    }
  
    requestAnimationFrame(draw);
});
