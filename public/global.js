// Theme from localStorage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');

document.addEventListener('DOMContentLoaded', () => {

  // Scroll reveal
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length > 0) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => { 
        if (e.isIntersecting) { 
          setTimeout(() => e.target.classList.add('visible'), i * 80); 
          ro.unobserve(e.target); 
        } 
      });
    }, { threshold: 0.08 });
    revealEls.forEach(el => ro.observe(el));
  }
});



// Form Alert Helper
window.showFormAlert = (msg, type) => {
  const el = document.getElementById('authAlert') || document.getElementById('formAlert');
  if (!el) return;
  const txt = document.getElementById('authAlertMsg') || document.getElementById('formAlertMsg');
  if (txt) txt.textContent = msg;
  
  const icon = el.querySelector('i');
  if (icon) icon.className = `bx ${type === 'error' ? 'bx-error-circle' : 'bx-check-circle'}`;
  
  // Keep base class (auth-alert or form-alert)
  const baseClass = el.id === 'authAlert' ? 'auth-alert' : 'form-alert';
  el.className = `${baseClass} ${type}`;
};
