/**
 * TrackerPro — Reusable UI Utility Module
 */

export const escapeHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export const showToast = (msg, type='success') => {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class='bx ${type==='success'?'bx-check-circle':'bx-error-circle'}'></i> <span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(()=>t.remove(),400); }, 3200);
};

export const animateValue = (el, start, end, dur, isPct=false) => {
  if(!el) return;
  if(el._animRaf) cancelAnimationFrame(el._animRaf);
  let ts0=null;
  const step=ts=>{
    if(!ts0)ts0=ts;
    const p=Math.min((ts-ts0)/dur,1);
    el.innerHTML=Math.floor(p*(end-start)+start)+(isPct?'%':'');
    if(p<1) el._animRaf = requestAnimationFrame(step);
  };
  el._animRaf = requestAnimationFrame(step);
};

export const launchConfetti = () => {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99998;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const COLORS = ['#ff8c00','#ffd700','#00ff7f','#ff4d4f','#6495ed','#ff69b4'];
    const particles = Array.from({length: 50}, () => ({
      x: Math.random() * canvas.width, y: -10,
      vx: (Math.random()-0.5)*5, vy: Math.random()*4+1.5,
      color: COLORS[Math.floor(Math.random()*COLORS.length)],
      size: Math.random()*8+3, angle: Math.random()*360, spin: (Math.random()-0.5)*10
    }));
    let frame = 0;
    const tick = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      particles.forEach(p => {
        p.x+=p.vx; p.y+=p.vy; p.angle+=p.spin; p.vy+=0.06;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.angle*Math.PI/180);
        ctx.globalAlpha = Math.max(0, 1 - frame/80);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6);
        ctx.restore();
      });
      frame++;
      if (frame < 100) requestAnimationFrame(tick); else canvas.remove();
    };
    requestAnimationFrame(tick);
};
