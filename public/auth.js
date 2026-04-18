document.addEventListener('DOMContentLoaded', () => {
  // Show/Hide password toggle
  const togglePws = document.querySelectorAll('.toggle-pw');
  togglePws.forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.field-group');
      const pwInput = parent.querySelector('input[type="password"]') || parent.querySelector('input[type="text"]');
      if (pwInput) {
        const isHidden = pwInput.type === 'password';
        pwInput.type = isHidden ? 'text' : 'password';
        btn.querySelector('i').className = isHidden ? 'bx bx-show' : 'bx bx-hide';
      }
    });
  });

  // Password strength meter (for signup)
  const signupPw = document.getElementById('signupPassword');
  if (signupPw) {
    signupPw.addEventListener('input', () => {
      const val = signupPw.value;
      const bars = [document.getElementById('bar1'), document.getElementById('bar2'), document.getElementById('bar3'), document.getElementById('bar4')];
      if (bars[0]) {
        bars.forEach(b => b.className = 'pw-bar');
        let strength = 0;
        if (val.length >= 8) strength++;
        if (/[A-Z]/.test(val)) strength++;
        if (/[0-9]/.test(val)) strength++;
        if (/[^A-Za-z0-9]/.test(val)) strength++;
        
        const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
        const classes = ['', 'weak', 'fair', 'fair', 'strong'];
        for (let i = 0; i < strength; i++) bars[i].classList.add(classes[strength]);
        
        const pwLabel = document.getElementById('pwLabel');
        if (pwLabel) pwLabel.textContent = strength === 0 ? 'Minimum 8 characters' : labels[strength];
      }
    });
  }

  // Social Demo Alerts
  const googleBtn = document.getElementById('googleBtn');
  const githubBtn = document.getElementById('githubBtn');
  if (googleBtn) googleBtn.addEventListener('click', () => showFormAlert('Google OAuth is not configured in this demo.', 'error'));
  if (githubBtn) githubBtn.addEventListener('click', () => showFormAlert('GitHub OAuth is not configured in this demo.', 'error'));

  // Login Form Submit
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const pw    = document.getElementById('loginPassword').value;
      const btn   = document.getElementById('loginSubmit');

      if (!email || !pw) { showFormAlert('Please fill in all fields.', 'error'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFormAlert('Please enter a valid email address.', 'error'); return; }
      if (pw.length < 6) { showFormAlert('Password must be at least 6 characters.', 'error'); return; }

      btn.classList.add('loading');
      btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> <span>Signing in...</span>`;

      setTimeout(() => {
        showFormAlert('Signed in successfully! Redirecting...', 'success');
        setTimeout(() => window.location.href = '/', 1200);
      }, 1400);
    });
  }

  // Signup Form Submit
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const firstName = document.getElementById('firstName').value.trim();
      const email     = document.getElementById('signupEmail').value.trim();
      const pw        = document.getElementById('signupPassword').value;
      const cpw       = document.getElementById('confirmPw').value;
      const btn       = document.getElementById('signupSubmit');

      if (!firstName) { showFormAlert('Please enter your first name.', 'error'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFormAlert('Please enter a valid email.', 'error'); return; }
      if (pw.length < 8) { showFormAlert('Password must be at least 8 characters.', 'error'); return; }
      if (pw !== cpw) { showFormAlert('Passwords do not match.', 'error'); return; }

      btn.classList.add('loading');
      btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> <span>Creating account...</span>`;

      setTimeout(() => {
        showFormAlert('Account created! Redirecting to your dashboard...', 'success');
        setTimeout(() => window.location.href = '/', 1200);
      }, 1600);
    });
  }
});
