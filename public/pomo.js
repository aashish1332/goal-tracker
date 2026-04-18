/**
 * TrackerPro — Pomodoro Module
 */

import { showToast } from './utils.js';
import { updateGoal } from './api.js';

const pomodoros = {}; // {goalId: {interval, timeLeft, isRunning, sessions}}

export const startPomodoro = (id, grantXPCallback) => {
    const btn = document.querySelector(`.start-pomo[data-id="${id}"]`);
    const timeEl = document.getElementById(`pomoTime-${id}`);
    const sessEl = document.getElementById(`pomoSess-${id}`);
    const ring = document.getElementById(`pomoRing-${id}`);
    if (!btn || !timeEl) return;
    
    if (!pomodoros[id]) pomodoros[id] = {timeLeft: 25*60, isRunning: false, sessions: 0, interval: null};
    let p = pomodoros[id];
    
    if (p.isRunning) {
        clearInterval(p.interval);
        p.isRunning = false;
        btn.innerHTML = `<i class='bx bx-play'></i>`;
        ring.style.animationPlayState = 'paused';
    } else {
        p.isRunning = true;
        btn.innerHTML = `<i class='bx bx-pause'></i>`;
        ring.style.animation = 'spin 60s linear infinite';
        ring.style.animationPlayState = 'running';
        
        p.interval = setInterval(() => {
            p.timeLeft--;
            if (p.timeLeft <= 0) {
                clearInterval(p.interval);
                p.isRunning = false;
                p.sessions++;
                p.timeLeft = 25*60;
                btn.innerHTML = `<i class='bx bx-play'></i>`;
                ring.style.animation = 'none';
                if (sessEl) sessEl.textContent = `${p.sessions} sessions`;
                showToast('Pomodoro session complete! +5 XP');
                if (grantXPCallback) grantXPCallback(5, id);
                
                // Save session count to backend
                updateGoal(id, { pomo_sessions: p.sessions });
            }
            const m = Math.floor(p.timeLeft / 60);
            const s = p.timeLeft % 60;
            timeEl.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }, 1000);
    }
};
