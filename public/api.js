/**
 * TrackerPro — API & Sync Module
 */

import { showToast } from './utils.js';

const API_BASE = '/api/goals';

export const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        throw new Error('Not authenticated');
    }
    const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
        throw new Error('Session expired');
    }
    return res;
};

export const fetchGoals = async () => {
    try {
        const res = await authFetch(API_BASE);
        if (!res.ok) throw new Error('API Error');
        const goals = await res.json();
        localStorage.setItem('rawGoalsCache', JSON.stringify(goals));
        return goals;
    } catch (err) {
        console.error(`Fetch error for ${API_BASE}:`, err.message);
        if (!navigator.onLine) {
            console.warn('Network is offline, attempting to load from local cache');
            const cached = localStorage.getItem('rawGoalsCache');
            if (cached) return JSON.parse(cached);
        }
        throw err;
    }
};

export const updateGoal = async (id, payload) => {
    try {
        const res = await authFetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Update failed');
        return await res.json();
    } catch (err) {
        queueOfflineSync(id, 'PUT', payload);
        throw err;
    }
};

export const deleteGoal = async (id) => {
    const res = await authFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    return await res.json();
};

export const patchSubtask = async (goalId, action, subtaskId, title) => {
    const res = await authFetch(`${API_BASE}/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, subtaskId, title })
    });
    if (!res.ok) throw new Error('Subtask update failed');
    return await res.json();
};

export const fetchStats = async () => {
    const res = await authFetch('/api/stats');
    if (!res.ok) return [];
    return await res.json();
};

export const createGoal = async (goalData) => {
    const res = await authFetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData)
    });
    if (!res.ok) {
        let errorMsg = 'Create failed';
        try {
            const errorData = await res.json();
            errorMsg = errorData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
    }
    return await res.json();
};

export const fetchUserLimits = async () => {
    const res = await authFetch('/api/user/limits');
    if (!res.ok) return { remainingMessages: 20 };
    return await res.json();
};

export const generateTip = async (id) => {
    const res = await authFetch(`/api/goals/${id}/generate-tip`, { method: 'POST' });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate tip');
    }
    return await res.json();
};

// -- OFFLINE SYNC QUEUE --
const syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');

const queueOfflineSync = (id, method, payload) => {
    if (!navigator.onLine) {
        syncQueue.push({ id, method, payload, timestamp: Date.now() });
        localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
        showToast('Offline: Change queued for sync', 'error');
    }
};

export const processSyncQueue = async () => {
    if (!navigator.onLine || syncQueue.length === 0) return;
    showToast('Syncing changes...');
    while (syncQueue.length > 0) {
        const item = syncQueue.shift();
        try {
            await updateGoal(item.id, item.payload);
        } catch {}
    }
    localStorage.setItem('syncQueue', '[]');
    showToast('All changes synced');
};

window.addEventListener('online', processSyncQueue);
