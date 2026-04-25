/**
 * TrackerPro — Main Dashboard Entry Point (Modular)
 */

import { escapeHtml, showToast, animateValue, launchConfetti } from './utils.js';
import { fetchGoals, updateGoal, deleteGoal, patchSubtask, fetchStats, createGoal, authFetch, fetchUserLimits, generateTip } from './api.js';

// Redirect to login if not authenticated
if (!localStorage.getItem('token')) {
    window.location.href = '/login.html';
}

import { renderCharts } from './charts-module.js';

let userObj = {};
try {
    userObj = JSON.parse(localStorage.getItem('user') || '{}');
} catch (e) {
    userObj = {};
}
const navAvatar = document.getElementById('navAvatar');
const navAuthBtn = document.getElementById('navAuthBtn');

if (navAvatar && navAuthBtn) {
    const fn = userObj.firstName || 'U';
    navAvatar.textContent = fn.charAt(0).toUpperCase();
    navAvatar.title = `${fn} ${userObj.lastName || ''}`.trim() || userObj.email;
    
    navAuthBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    });
}

document.addEventListener('DOMContentLoaded', () => {

  // ── GLOBALS ────────────────────────────────────────────────────────────────
  let rawGoals = [];
  let currentFilter = 'all';
  let searchTerm = '';
  let filterPriority = 'all';
  let filterTag = 'all';
  let sortOption = 'newest';
  let chartReady = false;
let openTipSections = new Set();
try { openTipSections = new Set(JSON.parse(localStorage.getItem('openTipSections') || '[]')); } catch(e) {}
let chatRemainingMessages = 20;

  // ── UPDATE CHAT LIMIT UI ──
  const updateChatRemainingUI = (remaining) => {
    chatRemainingMessages = remaining;
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatBtn');
    const statusText = document.getElementById('chatLimitStatus');
    
    if (remaining <= 0) {
        if(input) { input.disabled = true; input.placeholder = "Daily limit reached"; }
        if(sendBtn) sendBtn.disabled = true;
        if(statusText) statusText.innerHTML = "<span style='color:var(--neon-orange)'>Daily limit reached. 0 messages remaining.</span>";
    } else {
        if(input) { input.disabled = false; input.placeholder = "Ask AI anything..."; }
        if(sendBtn) sendBtn.disabled = false;
        if(statusText) statusText.innerHTML = `${remaining} messages remaining today.`;
    }
  };

  // ── XP / LEVEL SYSTEM ─────────────────────────────────────────────────────
  const XP_KEY  = 'trackerProXP';
  const XP_GOALS_KEY = 'trackerProXPGoals';
  const LEVEL_THRESHOLDS = [0, 50, 150, 300, 600, 1000, 1800, 3000];
  let xpData = { xp: 0, level: 1 };
  try { xpData = JSON.parse(localStorage.getItem(XP_KEY) || '{"xp":0,"level":1}'); } catch(e) {}
  let awardedGoals = new Set();
  try { awardedGoals = new Set(JSON.parse(localStorage.getItem(XP_GOALS_KEY) || '[]')); } catch(e) {}

  const getLevelFromXP = (xp) => {
    let lvl = 1;
    LEVEL_THRESHOLDS.forEach((t, i) => { if (xp >= t) lvl = i + 1; });
    return Math.min(lvl, LEVEL_THRESHOLDS.length);
  };

  const updateLevelBadge = () => {
    const levelEl  = document.getElementById('xpLevelText');
    const barFill  = document.getElementById('xpBarFill');
    const lvl      = getLevelFromXP(xpData.xp);
    if (levelEl) levelEl.textContent = `Lv.${lvl}`;
    if (barFill) {
      const getXpForLvl = (l) => LEVEL_THRESHOLDS[Math.max(l-1,0)];
      const getNextXp = (l) => LEVEL_THRESHOLDS[Math.min(l, LEVEL_THRESHOLDS.length-1)];
      const xpCurr = xpData.xp - getXpForLvl(lvl);
      const xpNeed = getNextXp(lvl) - getXpForLvl(lvl);
      barFill.style.width = `${xpNeed > 0 ? Math.min((xpCurr / xpNeed) * 100, 100) : 100}%`;
    }
  };

  const grantXP = (amount, goalId, x, y) => {
    if (goalId && awardedGoals.has(goalId)) return;
    const prevLvl = getLevelFromXP(xpData.xp);
    xpData.xp += amount;
    const newLvl = getLevelFromXP(xpData.xp);
    localStorage.setItem(XP_KEY, JSON.stringify(xpData));
    if (goalId) { awardedGoals.add(goalId); localStorage.setItem(XP_GOALS_KEY, JSON.stringify([...awardedGoals])); }
    updateLevelBadge();
    
    // XP Popup
    const pop = document.createElement('div');
    pop.className = 'xp-gain-popup'; pop.textContent = `+${amount} XP`;
    pop.style.left = `${x || window.innerWidth/2}px`; pop.style.top = `${y || 80}px`;
    document.body.appendChild(pop); setTimeout(() => pop.remove(), 1200);

    if (newLvl > prevLvl) {
      showToast(`🏆 Level Up! You're now Level ${newLvl}`);
      launchConfetti();
    }
  };

  // ── THEME ─────────────────────────────────────────────────────────────────
  const themeToggle = document.getElementById('themeToggle');
  let isDark = localStorage.getItem('theme') !== 'light';
  const applyTheme = () => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (themeToggle) themeToggle.innerHTML = isDark ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (chartReady) renderCharts(rawGoals, chartReady);
  };
  if (themeToggle) themeToggle.addEventListener('click', () => { isDark = !isDark; applyTheme(); });
  applyTheme();

// ── INITIAL BOOT & DATA ───────────────────────────────────────────────────
const loadChartJS = () => {
  return new Promise((resolve) => {
    if (window.Chart) { chartReady = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = () => { chartReady = true; resolve(); };
    s.onerror = () => { console.warn("Chart.js CDN failed"); chartReady = false; resolve(); };
    document.head.appendChild(s);
  });
};

const loadInitialData = async () => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log("[Loading] Starting initial data fetch...");
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 10000));
      
      const result = await Promise.race([
        Promise.all([
          fetchGoals().catch(err => { console.error("[Loading] fetchGoals error:", err); return null; }),
          loadChartJS().catch(err => { console.error("[Loading] loadChartJS error:", err); return null; })
        ]),
        timeoutPromise
      ]);

      if (result === 'TIMEOUT') {
        console.warn("[Loading] Data fetch timed out after 10s. Forcing UI display.");
      }

      const [goalsResult] = Array.isArray(result) ? result : [null, null];

      if (goalsResult) {
        rawGoals = Array.isArray(goalsResult) ? goalsResult.map(g => ({ ...g, duration: Number(g.duration) || 0 })) : [];
        console.log(`[Loading] Successfully loaded ${rawGoals.length} goals from server.`);
      } else {
        const cached = localStorage.getItem('rawGoalsCache');
        try {
            rawGoals = cached ? JSON.parse(cached) : [];
        } catch(e) {
            rawGoals = [];
        }
        console.log(`[Loading] Falling back to local cache (${rawGoals.length} goals).`);
      }

      const mainContent = document.getElementById('mainContent');
      const skeletonLoader = document.getElementById('skeletonLoader');
      if (mainContent) {
        mainContent.style.display = 'block';
        console.log("[Loading] Main content visible.");
      }
      if (skeletonLoader) {
        skeletonLoader.style.display = 'none';
        console.log("[Loading] Skeleton loader hidden.");
      }
    renderGoalsList();
    fetchUserLimits().then(limits => updateChatRemainingUI(limits.remainingMessages)).catch(console.error);
    requestAnimationFrame(() => {
        updateAnalytics();
        renderHeatmap();
        updateStreak();
    });

    // Auto-award XP for newly completed goals
    rawGoals.forEach(g => {
        if (g.completed && !awardedGoals.has(g.id)) {
            grantXP(10 + (g.subtasks||[]).filter(s=>s.completed).length*2, g.id);
        }
    });

    break; // Success, exit retry loop
    } catch (err) {
      console.warn(`Attempt ${attempt} to load data failed:`, err);
      if (attempt === maxAttempts) console.error("Initial data load completely failed");
      await new Promise(res => setTimeout(res, 500));
    }
  }
};

   const updateAnalytics = () => {
     const total = rawGoals.length;
     const completed = rawGoals.filter(g=>g.completed).length;
     const score = total > 0 ? Math.round(rawGoals.reduce((a,g)=>a+Number(g.progress),0)/total) : 0;

     animateValue(document.getElementById('statTotal'), 0, total, 500);
     animateValue(document.getElementById('statCompleted'), 0, completed, 500);
     animateValue(document.getElementById('statPending'), 0, total-completed, 500);
     animateValue(document.getElementById('statScore'), 0, score, 500, true);

     // Update Liquid Orb
     const liquid = document.getElementById('orbLiquid');
     const orbValue = document.getElementById('orbValue');
     if (liquid) liquid.style.top = `${100 - score}%`;
     if (orbValue) animateValue(orbValue, parseInt(orbValue.textContent)||0, score, 500, true);

 if (chartReady) renderCharts(rawGoals, chartReady);
  renderAIInsights();
};

// ── INTERACTIVE MOUSE TRACKING FOR UI CARDS ────────────────────────────────
// Cache the card list so we don't querySelectorAll on every single mouse frame
let mouseX = 0, mouseY = 0, glowTicking = false;
let _glowCards = null;
const getGlowCards = () => {
  if (!_glowCards) _glowCards = document.querySelectorAll('.stat-card, .goal-card, .chart-container, .heatmap-section, .ai-insights-panel, .add-goal-section');
  return _glowCards;
};
// Invalidate cache whenever goals re-render (called from renderGoalsList)
const invalidateGlowCache = () => { _glowCards = null; };

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (!glowTicking) {
    requestAnimationFrame(() => {
      const cards = getGlowCards();
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${mouseX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${mouseY - rect.top}px`);
      }
      glowTicking = false;
    });
    glowTicking = true;
  }
}, { passive: true });

// ── GOAL LIST RENDERING ──────────────────────────────────────────────────
  const renderGoalsList = () => {
    const container = document.getElementById('goalsContainer');
    const emptyState = document.getElementById('emptyState');
    if (!container) return;

    let filtered = rawGoals.filter(g => {
      if (currentFilter==='pending' && g.completed) return false;
      if (currentFilter==='completed' && !g.completed) return false;
      if (searchTerm && !g.title.toLowerCase().includes(searchTerm)) return false;
      if (filterPriority!=='all' && g.priority!==filterPriority) return false;
      if (filterTag!=='all' && !(g.tags||[]).includes(filterTag)) return false;
      return true;
    });

    // Sort
    filtered.sort((a,b) => {
        if(sortOption==='urgency') return (a.deadline?new Date(a.deadline):Infinity) - (b.deadline?new Date(b.deadline):Infinity);
        if(sortOption==='progress') return (b.progress||0) - (a.progress||0);
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Batch DOM updates with DocumentFragment for performance
    const fragment = document.createDocumentFragment();
    if (filtered.length === 0) { 
        if (emptyState) emptyState.style.display = 'block'; 
        container.innerHTML = ''; 
        return; 
    }
    if (emptyState) emptyState.style.display = 'none';

    filtered.forEach((g, i) => {
        const card = document.createElement('div');
        card.className = `goal-card ${g.completed?'completed':''}`;
        card.dataset.id = g.id;
        card.dataset.progress = g.progress;
        card.style.animationDelay = `${i*0.05}s`;

const getDeadlineInfo = () => {
 if (!g.deadline) return '';
 const dl = new Date(g.deadline);
 const now = new Date();
 const diff = dl - now;
 const timeStr = dl.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
 if (diff <= 0) return `<span class="deadline-badge overdue" title="${timeStr}">Overdue</span>`;
 const days = Math.floor(diff / (1000 * 60 * 60 * 24));
 const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
 if (days > 0) return `<span class="deadline-badge" title="${timeStr}">${days}d ${hours}h left</span>`;
 const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
 if (hours > 0) return `<span class="deadline-badge urgent" title="${timeStr}">${hours}h ${mins}m left</span>`;
 return `<span class="deadline-badge urgent" title="${timeStr}">${mins}m left</span>`;
};

        const dl = g.deadline ? getDeadlineInfo() : '';
        const tags = (g.tags||[]).map(t => `<span class="goal-tag">#${escapeHtml(t)}</span>`).join('');
        const hasSubtasks = (g.subtasks || []).length > 0;
        const subtasks = (g.subtasks || []).map(st => `
            <label class="subtask-item">
                <input type="checkbox" class="subtask-checkbox" data-subtask-id="${st.id}" ${st.completed ? 'checked' : ''}>
                <span class="subtask-title ${st.completed ? 'completed' : ''}">${escapeHtml(st.title)}</span>
                <button class="delete-subtask-btn" data-subtask-id="${st.id}" title="Delete subtask"><i class='bx bx-x'></i></button>
            </label>
        `).join('');

        const progressArea = !hasSubtasks ? `
            <div class="merged-progress-container">
                <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${g.progress}%"></div></div>
                <input type="range" class="progress-slider" min="0" max="100" value="${g.progress}" data-goal-id="${g.id}">
            </div>
            <div style="text-align: right; margin-top: 4px;"><span class="slider-value" style="margin: 0;">${g.progress}%</span></div>
        ` : `
            <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${g.progress}%"></div></div>
        `;

card.innerHTML = `
 <i class='bx bx-grid-vertical drag-handle'></i>
 <div class="goal-card-header">
 <div>
 <input type="text" class="goal-title-edit" value="${escapeHtml(g.title)}" data-id="${g.id}">
 <div style="margin-top:4px">
 <span class="goal-deadline-edit" data-id="${g.id}" data-deadline="${g.deadline || ''}" title="Click to edit deadline">${dl || '<span class="deadline-badge" style="opacity:0.5">Set deadline</span>'}</span>
 ${g.recurrence?'<span class="recurring-badge">Recur</span>':''}
 </div>
 <div class="goal-tags">${tags}</div>
 </div>
 <span class="priority-badge ${g.priority}">${g.priority}</span>
 </div>
            <div class="progress-wrapper">
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:5px">
                    <span>${g.progress}% Complete</span>
                    <svg id="spark-${g.id}" width="40" height="12"></svg>
                </div>
                ${progressArea}
            </div>
            <div class="subtasks-section">
                <div class="subtasks-header">
                    <span class="subtasks-label">Subtasks${hasSubtasks ? ' (' + g.subtasks.length + ')' : ''}</span>
                    <button class="add-subtask-btn" data-goal-id="${g.id}" title="Add subtask"><i class='bx bx-plus'></i></button>
                </div>
                <div class="subtasks-list">${subtasks}</div>
                <div class="inline-subtask-container" id="inline-add-${g.id}" style="display: none;">
                    <div class="inline-subtask-wrapper">
                        <i class='bx bx-check-circle inline-subtask-icon'></i>
                        <input type="text" class="inline-subtask-input" id="inline-input-${g.id}" placeholder="What needs to be done?" autocomplete="off">
                        <button class="inline-subtask-save" data-goal-id="${g.id}"><i class='bx bx-check'></i></button>
                    </div>
                </div>
            </div>
            <div class="ai-tip-section" id="tip-section-${g.id}" style="${openTipSections.has(g.id) ? 'display: block;' : 'display: none;'} padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 10px; font-size: 0.85rem; border-left: 3px solid var(--neon-purple);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                    <strong><i class='bx bx-bulb'></i> AI Tip</strong>
                    <span class="tip-count-badge" style="font-size: 0.7rem; opacity: 0.7;">${g.aiTipCount || 0}/5 tips</span>
                </div>
                <div class="tip-content" id="tip-content-${g.id}">${g.aiTip ? escapeHtml(g.aiTip) : 'Loading tip...'}</div>
                ${(!g.aiTipCount || g.aiTipCount < 5) ? `<button class="regen-tip-btn" data-id="${g.id}" style="margin-top:5px; font-size:0.7rem; padding: 2px 5px; cursor: pointer; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: var(--text-main);">Regenerate (costs 1 tip)</button>` : '<div style="margin-top:5px; font-size:0.7rem; opacity:0.5;">Tip limit reached for this goal.</div>'}
            </div>
            <div class="card-actions">
                <button class="tip-btn" data-id="${g.id}" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:0.9rem;" title="Get AI Tip">💡 Tip</button>
                <button class="delete-btn" data-id="${g.id}"><i class='bx bx-trash'></i></button>
            </div>
        `;
        fragment.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
    invalidateGlowCache(); // Refresh cached card list after DOM update

    // Draw sparklines after DOM insertion (batched)
    requestAnimationFrame(() => {
        filtered.forEach(g => drawSparkline(g.id, g.progress_history));
    });

    populateTagFilter();
    // Events are delegated globally - no need to re-attach
  };

  const populateTagFilter = () => {
    const sel = document.getElementById('filterTag');
    if (!sel) return;
    const current = sel.value;
    const tags = new Set();
    rawGoals.forEach(g => (g.tags||[]).forEach(t => tags.add(t)));
    sel.innerHTML = '<option value="all">All Tags</option>' + 
      [...tags].sort().map(t => `<option value="${t}" ${t===current?'selected':''}>#${t}</option>`).join('');
  };

  const confirmInlineAddSubtask = async (goalId, inputEl) => {
    if (!goalId || !inputEl) return;
    const title = inputEl.value.trim();
    if (!title) {
        showToast('Please enter a subtask title', 'error');
        return;
    }
    try {
      const result = await patchSubtask(goalId, 'add', null, title);
      const idx = rawGoals.findIndex(g => g.id === goalId);
      if (idx !== -1) rawGoals[idx] = result;
      renderGoalsList();
      updateAnalytics();
      showToast('Subtask added');
      // Keep input open
      setTimeout(() => {
          const inlineContainer = document.getElementById(`inline-add-${goalId}`);
          if (inlineContainer) {
              inlineContainer.style.display = 'block';
              const input = document.getElementById(`inline-input-${goalId}`);
              if (input) input.focus();
          }
      }, 0);
    } catch (err) {
      showToast('Failed to add subtask', 'error');
    }
  };

  document.getElementById('goalsContainer')?.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('inline-subtask-input')) {
          if (e.key === 'Enter') {
              const goalId = e.target.id.replace('inline-input-', '');
              confirmInlineAddSubtask(goalId, e.target);
          } else if (e.key === 'Escape') {
              const goalId = e.target.id.replace('inline-input-', '');
              const inlineContainer = document.getElementById(`inline-add-${goalId}`);
              if (inlineContainer) inlineContainer.style.display = 'none';
          }
      }
  });

  // ── EVENTS ────────────────────────────────────────────────────────────────
  // Use event delegation for better performance (attach once, not per render)
  document.getElementById('goalsContainer')?.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.delete-btn');
    if (delBtn) {
        const id = delBtn.dataset.id;
        if (confirm('Delete this goal?')) {
            await deleteGoal(id);
            rawGoals = rawGoals.filter(g=>g.id!==id);
            renderGoalsList();
            updateAnalytics();
        }
        return;
    }

    // Tip button toggle logic
    const tipBtn = e.target.closest('.tip-btn');
    if (tipBtn) {
        const id = tipBtn.dataset.id;
        if (openTipSections.has(id)) {
            openTipSections.delete(id);
            localStorage.setItem('openTipSections', JSON.stringify([...openTipSections]));
            document.getElementById(`tip-section-${id}`).style.display = 'none';
        } else {
            openTipSections.add(id);
            localStorage.setItem('openTipSections', JSON.stringify([...openTipSections]));
            const goal = rawGoals.find(g => g.id === id);
            
            if (!goal.aiTip && (goal.aiTipCount || 0) < 5) {
                document.getElementById(`tip-section-${id}`).style.display = 'block';
                document.getElementById(`tip-content-${id}`).innerHTML = 'Generating tip...';
                generateTip(id).then(res => {
                    goal.aiTip = res.tip;
                    goal.aiTipCount = res.aiTipCount;
                    renderGoalsList();
                }).catch(err => {
                    document.getElementById(`tip-content-${id}`).innerHTML = `<span style="color:var(--neon-orange)">${escapeHtml(err.message)}</span>`;
                });
            } else {
                renderGoalsList();
            }
        }
        return;
    }

    // Regenerate Tip logic
    const regenBtn = e.target.closest('.regen-tip-btn');
    if (regenBtn) {
        const id = regenBtn.dataset.id;
        const tipContent = document.getElementById(`tip-content-${id}`);
        tipContent.innerHTML = 'Generating new tip...';
        regenBtn.style.display = 'none';
        generateTip(id).then(res => {
            const goal = rawGoals.find(g => g.id === id);
            goal.aiTip = res.tip;
            goal.aiTipCount = res.aiTipCount;
            renderGoalsList();
            setTimeout(() => {
                const newTipSection = document.getElementById(`tip-section-${id}`);
                if(newTipSection) newTipSection.style.display = 'block';
            }, 0);
        }).catch(err => {
            tipContent.innerHTML = `<span style="color:var(--neon-orange)">${escapeHtml(err.message)}</span>`;
            regenBtn.style.display = 'inline-block';
        });
        return;
    }

// Add subtask button
 const addSubtaskBtn = e.target.closest('.add-subtask-btn');
 if (addSubtaskBtn) {
    const goalId = addSubtaskBtn.dataset.goalId;
    const inlineContainer = document.getElementById(`inline-add-${goalId}`);
    if (inlineContainer) {
        if (inlineContainer.style.display === 'none') {
            inlineContainer.style.display = 'block';
            const input = document.getElementById(`inline-input-${goalId}`);
            if (input) input.focus();
            const list = inlineContainer.previousElementSibling;
            if (list) setTimeout(() => list.scrollTop = list.scrollHeight, 100);
        } else {
            inlineContainer.style.display = 'none';
        }
    }
    return;
 }

 // Inline Save Button
 const inlineSaveBtn = e.target.closest('.inline-subtask-save');
 if (inlineSaveBtn) {
     const goalId = inlineSaveBtn.dataset.goalId;
     const input = document.getElementById(`inline-input-${goalId}`);
     if (input) confirmInlineAddSubtask(goalId, input);
     return;
 }

 // Deadline edit click
 const deadlineEdit = e.target.closest('.goal-deadline-edit');
 if (deadlineEdit) {
 const goalId = deadlineEdit.dataset.id;
 const currentDeadline = deadlineEdit.dataset.deadline || '';
 const input = document.createElement('input');
 input.type = 'datetime-local';
 input.value = currentDeadline;
 input.style.cssText = 'background:var(--card-bg);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:var(--text-main);padding:3px 8px;font-size:0.72rem;outline:none;';
 deadlineEdit.innerHTML = '';
 deadlineEdit.appendChild(input);
 input.focus();

 const saveDeadline = async () => {
 const newDeadline = input.value || null;
 try {
 const result = await updateGoal(goalId, { deadline: newDeadline });
 const idx = rawGoals.findIndex(g => g.id === goalId);
 if (idx !== -1) rawGoals[idx] = result;
 renderGoalsList();
 updateAnalytics();
 if (newDeadline) showToast('Deadline updated');
 } catch (err) {
 showToast('Failed to update deadline', 'error');
 renderGoalsList();
 }
 };

 input.addEventListener('blur', saveDeadline);
 input.addEventListener('keydown', (ev) => {
 if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
 if (ev.key === 'Escape') { renderGoalsList(); }
 });
 return;
 }

    // Delete subtask button
    const delSubtaskBtn = e.target.closest('.delete-subtask-btn');
    if (delSubtaskBtn) {
        const goalId = delSubtaskBtn.closest('.goal-card').dataset.id;
        const subtaskId = delSubtaskBtn.dataset.subtaskId;
        if (confirm('Delete this subtask?')) {
            try {
                const result = await patchSubtask(goalId, 'delete', subtaskId);
                const idx = rawGoals.findIndex(g => g.id === goalId);
                if (idx !== -1) rawGoals[idx] = result;
                renderGoalsList();
                updateAnalytics();
                showToast('Subtask deleted');
            } catch (err) {
                showToast('Failed to delete subtask', 'error');
            }
        }
        return;
    }
  });

  // Live slider feedback
  document.getElementById('goalsContainer')?.addEventListener('input', (e) => {
      if (e.target.classList.contains('progress-slider')) {
          const val = e.target.value;
          const card = e.target.closest('.goal-card');
          if (card) {
              const fill = card.querySelector('.progress-bar-fill');
              if (fill) {
                  fill.style.width = `${val}%`;
                  fill.removeAttribute('data-prog-low');
                  fill.removeAttribute('data-prog-mid');
                  fill.removeAttribute('data-prog-high');
                  if (val < 40) fill.setAttribute('data-prog-low', '');
                  else if (val < 80) fill.setAttribute('data-prog-mid', '');
                  else fill.setAttribute('data-prog-high', '');
              }
              const headerTxt = card.querySelector('.progress-wrapper > div > span:first-child');
              if (headerTxt) headerTxt.textContent = `${val}% Complete`;
              const bottomTxt = card.querySelector('.slider-value');
              if (bottomTxt) bottomTxt.textContent = `${val}%`;
          }
      }
  });

  // Subtask checkbox toggle
  document.getElementById('goalsContainer')?.addEventListener('change', async (e) => {
    if (e.target.classList.contains('subtask-checkbox')) {
        const goalId = e.target.closest('.goal-card').dataset.id;
        const subtaskId = e.target.dataset.subtaskId;
        try {
            const result = await patchSubtask(goalId, 'toggle', subtaskId);
            const idx = rawGoals.findIndex(g => g.id === goalId);
            if (idx !== -1) rawGoals[idx] = result;
            renderGoalsList();
            updateAnalytics();
        } catch (err) {
            e.target.checked = !e.target.checked; // Revert on failure
            showToast('Failed to update subtask', 'error');
        }
        return;
    }

    if (e.target.classList.contains('goal-title-edit')) {
        const input = e.target;
        await updateGoal(input.dataset.id, { title: input.value });
        showToast('Title updated');
    }

    if (e.target.classList.contains('progress-slider')) {
        const goalId = e.target.dataset.goalId;
        const newProgress = parseInt(e.target.value);
        try {
            await updateGoal(goalId, { progress: newProgress });
            const idx = rawGoals.findIndex(g => g.id === goalId);
            if (idx !== -1) {
                rawGoals[idx].progress = newProgress;
                rawGoals[idx].completed = newProgress === 100;
            }
            renderGoalsList();
            updateAnalytics();
            showToast('Progress updated');
        } catch (err) {
            showToast('Failed to update progress', 'error');
        }
    }
  });

  // ── STATIC GLOBAL LISTENERS (outside goals container) ────────────────────
  // Chat toggle
  document.getElementById('chatToggleBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('chatPanel');
    if (panel) panel.classList.toggle('closed');
  });
  document.getElementById('closeChatBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('chatPanel');
    if (panel) panel.classList.add('closed');
  });

  // --- AI CHAT LOGIC ---
  const chatInput = document.getElementById('chatInput');
  const chatBody = document.getElementById('chatBody');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const chatLoader = document.getElementById('chatLoader');
  const chatChips = document.querySelectorAll('#chatChips .chip');
  let chatHistory = [];

  const appendMessage = (role, content) => {
    if (!chatBody || !chatLoader) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role} entry-anim`;
    // Simple markdown-ish bolding support
    const formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    msgDiv.innerHTML = `<div class="msg-content">${formatted}</div>`;
    chatBody.insertBefore(msgDiv, chatLoader);
    chatBody.scrollTop = chatBody.scrollHeight;
  };

  const handleSendMessage = async (customMsg) => {
    const text = typeof customMsg === 'string' ? customMsg : chatInput?.value?.trim();
    if (!text) return;
    
    if (chatInput && typeof customMsg !== 'string') chatInput.value = '';
    appendMessage('user', text);
    
    if (chatLoader) chatLoader.style.display = 'block';
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;

    try {
      const response = await authFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory })
      });

      const data = await response.json();
      if (chatLoader) chatLoader.style.display = 'none';

      if (response.status === 429) {
          showToast(data.error || 'Daily limit reached', 'error');
          updateChatRemainingUI(0);
          return;
      }

      if (data.reply) {
        appendMessage('bot', data.reply);
        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: data.reply });
        if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
        
        if (data.remainingMessages !== undefined) {
            updateChatRemainingUI(data.remainingMessages);
        }
      } else {
        showToast(data.error || 'AI response failed', 'error');
      }
    } catch (err) {
      if (chatLoader) chatLoader.style.display = 'none';
      showToast('Network error: AI unreachable', 'error');
    }
  };

  sendChatBtn?.addEventListener('click', () => handleSendMessage());
  chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendMessage(); });
  chatChips.forEach(chip => {
    chip.addEventListener('click', () => handleSendMessage(chip.dataset.msg));
  });


  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('chatPanel')?.classList.add('closed');
    }
  });

  // Mobile menu
  document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    document.getElementById('mobileDrawer')?.classList.add('open');
  });
  document.getElementById('mobileDrawerClose')?.addEventListener('click', () => {
    document.getElementById('mobileDrawer')?.classList.remove('open');
  });
  document.getElementById('mobileDrawerBackdrop')?.addEventListener('click', () => {
    document.getElementById('mobileDrawer')?.classList.remove('open');
  });

  // Search clear button
  document.getElementById('searchClear')?.addEventListener('click', () => {
    const input = document.getElementById('searchInput');
    if (input) {
      input.value = '';
      searchTerm = '';
      input.focus();
      renderGoalsList();
      const clearBtn = document.getElementById('searchClear');
      if (clearBtn) clearBtn.style.display = 'none';
    }
  });

  // Static Global Listeners
  document.querySelectorAll('.filter-tabs .tab').forEach(tab => tab.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-tabs .tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active'); currentFilter = tab.dataset.filter; renderGoalsList();
  }));

  // Goal form submission
  const goalForm = document.getElementById('goalForm');
  if (goalForm) {
    goalForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titleInput = document.getElementById('goalTitle');
      const prioritySelect = document.getElementById('goalPriority');
      const deadlineInput = document.getElementById('goalDeadlineInput');
      const recurrenceSelect = document.getElementById('goalRecurrence');

      const title = titleInput.value.trim();
      if (!title) {
        showToast('Please enter a goal title', 'error');
        return;
      }

      const goalData = {
        title,
        priority: prioritySelect.value,
        deadline: deadlineInput.value || null,
        recurrence: recurrenceSelect.value || null,
        progress: 0,
        completed: false,
        subtasks: [],
        progress_history: []
      };

      try {
        const newGoal = await createGoal(goalData);
        rawGoals.push(newGoal);
        renderGoalsList();
        updateAnalytics();

        // Reset form
        titleInput.value = '';
        prioritySelect.value = 'Medium';
        deadlineInput.value = '';
        recurrenceSelect.value = '';

        showToast('Goal created successfully!');
      } catch (error) {
        console.error('Failed to create goal:', error);
        showToast(error.message || 'Failed to create goal. Please try again.', 'error');
      }
    });
  }

  let searchTimer;
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    clearTimeout(searchTimer);
    // Slightly longer debounce for search to reduce re-renders during typing
    searchTimer = setTimeout(() => renderGoalsList(), 200);
  });

  document.getElementById('filterPriority')?.addEventListener('change', (e) => { filterPriority = e.target.value; renderGoalsList(); });
  document.getElementById('filterTag')?.addEventListener('change', (e) => { filterTag = e.target.value; renderGoalsList(); });
  document.getElementById('sortSelect')?.addEventListener('change', (e) => { sortOption = e.target.value; renderGoalsList(); });

  // ── TOUCH DRAG & DROP ─────────────────────────────────────────────────────
  let dragItem = null;
  const setupTouchDnD = () => {
    const list = document.getElementById('goalsContainer');
    list.addEventListener('touchstart', e => {
      if (e.target.classList.contains('drag-handle')) {
        dragItem = e.target.closest('.goal-card');
        dragItem.classList.add('dragging');
        e.preventDefault();
      }
    }, {passive: false});

    list.addEventListener('touchmove', e => {
      if (!dragItem) return;
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const over = target?.closest('.goal-card');
      if (over && over !== dragItem) {
        const rect = over.getBoundingClientRect();
        const mid = rect.top + rect.height/2;
        if (touch.clientY < mid) list.insertBefore(dragItem, over);
        else list.insertBefore(dragItem, over.nextSibling);
      }
      e.preventDefault();
    }, {passive: false});

    list.addEventListener('touchend', () => {
      if (dragItem) {
        dragItem.classList.remove('dragging');
        dragItem = null;
        saveGoalOrder(); 
      }
    });

    // Mouse DnD
    list.addEventListener('dragstart', e => {
        dragItem = e.target.closest('.goal-card');
        if (dragItem) setTimeout(() => dragItem.classList.add('dragging'), 0);
    });
    list.addEventListener('dragover', e => {
        e.preventDefault();
        const over = e.target.closest('.goal-card');
        if (over && over !== dragItem) {
            const rect = over.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height/2) list.insertBefore(dragItem, over);
            else list.insertBefore(dragItem, over.nextSibling);
        }
    });
    list.addEventListener('dragend', () => {
        if (dragItem) {
            dragItem.classList.remove('dragging');
            dragItem = null;
            saveGoalOrder();
        }
    });
  };

  const saveGoalOrder = async () => {
    const ids = [...document.querySelectorAll('.goal-card')].map(c => c.dataset.id);
    try {
        await authFetch('/api/goals/reorder', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedIds: ids })
        });
        // Sync rawGoals order
        rawGoals = ids.map(id => rawGoals.find(g => g.id === id)).filter(Boolean);
    } catch {}
  };

  setupTouchDnD();

  // ── OTHER RENDERERS ───────────────────────────────────────────────────────
  const drawSparkline = (goalId, history) => {
    const svg = document.getElementById(`spark-${goalId}`);
    if (!svg || !history || history.length < 2) return;
    const sorted = [...history].sort((a,b) => a.date.localeCompare(b.date));
    const data = sorted.map(i => Number(i.progress));
    const w = 40, h = 12, max = 100;
    let d = `M 0,${h - (data[0]/max)*h}`;
    for (let i=1; i<data.length; i++) {
        d += ` L ${(i/(data.length-1))*w},${h - (data[i]/max)*h}`;
    }
    const color = data[data.length-1] >= data[0] ? 'var(--neon-green)' : 'var(--neon-orange)';
    svg.innerHTML = `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" />`;
  };

  // Cached computations to avoid recalculation on every render
  let heatmapCache = null, streakCache = null, lastRenderGoals = null;

  const renderHeatmap = () => {
    const grid = document.getElementById('heatmapGrid'); if(!grid) return;
    // Skip if goals haven't changed since last render
    if (heatmapCache && rawGoals === lastRenderGoals) { grid.innerHTML = heatmapCache; return; }
    const counts = {};
    rawGoals.forEach(g => { const d = g.createdAt.slice(0,10); counts[d] = (counts[d]||0)+1; });
    const today = new Date(); today.setHours(0,0,0,0);
    let html = '';
    for(let i=55; i>=0; i--) {
        const d = new Date(today); d.setDate(d.getDate()-i);
        const k = d.toISOString().slice(0,10), c = counts[k]||0;
        const l = c===0?0:c===1?1:c<=3?2:3;
        html += `<div class="hmap-day level-${l}" title="${k}: ${c} goals"></div>`;
    }
    heatmapCache = html; lastRenderGoals = rawGoals;
    grid.innerHTML = html;
  };

  const updateStreak = () => {
    const el = document.getElementById('streakNum'); if(!el) return;
    // Skip if goals haven't changed
    if (streakCache !== null && rawGoals === lastRenderGoals) { animateValue(el, 0, streakCache, 500); return; }
    const days = new Set(rawGoals.map(g => g.createdAt.slice(0,10)));
    let streak = 0, today = new Date();
    for(let i=0; i<365; i++) {
        const d = new Date(today); d.setDate(d.getDate()-i);
        if (days.has(d.toISOString().slice(0,10))) streak++; else if(i>0) break;
    }
    streakCache = streak; lastRenderGoals = rawGoals;
    animateValue(el, 0, streak, 500);
  };

  const renderAIInsights = () => {
    const grid = document.getElementById('insightsGrid'); if(!grid) return;
    const score = rawGoals.length > 0 ? Math.round(rawGoals.reduce((a,g)=>a+Number(g.progress),0)/rawGoals.length) : 0;
    const insights = [];
    if(score >= 80) insights.push({icon:'🚀',text:'<strong>Great job!</strong> high productivity.'});
    else if(score >= 40) insights.push({icon:'📈',text:'<strong>Steady progress.</strong> Keep it up.'});
    else insights.push({icon:'⚡',text:'<strong>Low pacity.</strong> Focus on small tasks.'});
    grid.innerHTML = insights.map(i => `<div class="ai-insight-item"><span class="ai-insight-icon">${i.icon}</span><div class="ai-insight-text">${i.text}</div></div>`).join('');
  };

  loadInitialData().catch(err => { console.error('Initial load error:', err); const mainContent = document.getElementById('mainContent'); const skeletonLoader = document.getElementById('skeletonLoader'); if (mainContent) mainContent.style.display = 'block'; if (skeletonLoader) skeletonLoader.style.display = 'none'; renderGoalsList(); updateAnalytics(); });
});
