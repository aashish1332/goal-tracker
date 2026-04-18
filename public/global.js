// Theme from localStorage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');

document.addEventListener('DOMContentLoaded', () => {
  // Theme Toggle Button
  const themeToggle = document.getElementById('themeToggle');
  let isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  
  const setTheme = () => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (themeToggle) themeToggle.innerHTML = isDark ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };
  
  if (themeToggle) themeToggle.addEventListener('click', () => { isDark = !isDark; setTheme(); });

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

// Toast Notifications
window.showToast = (msg, type = 'success') => {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class='bx ${type === 'error' ? 'bx-error-circle' : 'bx-check-circle'}'></i> <span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 380); }, 3600);
};

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
