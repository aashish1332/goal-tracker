const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const compression = require('compression');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dataFile = path.join(__dirname, 'data', 'goals.json');
const statsFile = path.join(__dirname, 'data', 'stats.json');
const GROQ_KEY = process.env.GROQ_API_KEY;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('[Init] Created data directory');
}

// Compress responses (gzip)
app.use(compression());

// Limit request body size
app.use(express.json({ limit: '100kb' }));

// Static assets: aggressively cache for one year, don't revalidate
// Static assets: Rely on ETags for revalidation instead of long-term expiry
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // Never cache HTML files to ensure we always have the latest app shell
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // Fast revalidation for assets
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

let goalsCache = null;

// Read goals
const readGoals = () => {
    if (goalsCache !== null) return goalsCache;
    try {
        if (!fs.existsSync(dataFile)) {
            goalsCache = [];
            return goalsCache;
        }
        const data = fs.readFileSync(dataFile, 'utf8');
        goalsCache = JSON.parse(data).map(g => ({
            ...g,
            duration: g.duration || 0 // Migration: Default to 0 if missing
        }));
        return goalsCache;
    } catch (err) {
        console.error("Error reading JSON", err);
        goalsCache = [];
        return goalsCache;
    }
};

// Write goals — invalidate cache on failure
const writeGoals = (goals) => {
    goalsCache = goals;
    fs.promises.writeFile(dataFile, JSON.stringify(goals, null, 2)).catch(err => {
        console.error("Error writing JSON — invalidating cache:", err);
        goalsCache = null; // Force re-read from disk next time
    });
};

// Sanitize string input
const sanitizeStr = (s, maxLen = 200) =>
    typeof s === 'string' ? s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen) : '';

// ── DAILY SNAPSHOTS & RECURRENCE ──

const processRecurrence = () => {
    const goals = readGoals();
    let changed = false;
    const today = new Date().toISOString().slice(0, 10);

    goals.forEach(g => {
        if (g.recurrence && g.completed) {
            // Check if we should reset based on recurrence type
            const lastUpdate = (g.updatedAt || g.createdAt).slice(0, 10);
            if (lastUpdate < today) {
                // Simplistic reset for daily/weekly/monthly
                g.completed = false;
                g.progress = 0;
                g.subtasks.forEach(st => st.completed = false);
                g.updatedAt = new Date().toISOString();
                changed = true;
                console.log(`[Recurrence] Resetting goal: ${g.title}`);
            }
        }
    });

    if (changed) writeGoals(goals);
};

const takeDailySnapshot = () => {
    const goals = readGoals();
    const today = new Date().toISOString().slice(0, 10);
    
    let stats = [];
    try {
        if (fs.existsSync(statsFile)) stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    } catch {}

    const alreadyDone = stats.find(s => s.date === today);
    if (!alreadyDone) {
        const total = goals.length;
        const score = total > 0 ? Math.round(goals.reduce((a, g) => a + Number(g.progress), 0) / total) : 0;
        stats.push({ date: today, score, total });
        if (stats.length > 30) stats.shift();
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    }
};

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Initialization Function (Run async after startup)
const initializeServer = async () => {
    try {
        console.log('[Init] Running maintenance tasks...');
        processRecurrence();
        takeDailySnapshot();
        // Schedule recurrence check hourly instead of on every request
        setInterval(() => {
            try { processRecurrence(); takeDailySnapshot(); }
            catch (e) { console.error('[Scheduled] Maintenance error:', e.message); }
        }, 60 * 60 * 1000);
    } catch (err) {
        console.error('[Init] Error during maintenance:', err.message);
    }
};

// ── GET all goals ──────────────────────────────────────────────────────────
// Cache for goals endpoint (5 second TTL to reduce disk reads)
let goalsCacheTs = 0;
const GOALS_CACHE_TTL = 5000;

app.get('/api/goals', (req, res) => {
    const now = Date.now();
    if (now - goalsCacheTs < GOALS_CACHE_TTL && goalsCache !== null) {
        return res.json(goalsCache);
    }
    const goals = readGoals();
    goalsCacheTs = now;
    res.json(goals);
});

// ── GET snapshots ──────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
    try {
        if (!fs.existsSync(statsFile)) return res.json([]);
        const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
        res.json(stats);
    } catch { res.json([]); }
});

// ── POST new goal ──────────────────────────────────────────────────────────
app.post('/api/goals', (req, res) => {
    try {
        const { title, priority, deadline, notes, recurrence, tags, duration } = req.body;
        const cleanTitle = sanitizeStr(title, 150);
        if (!cleanTitle) return res.status(400).json({ error: "Title is required" });

        const newGoal = {
            id: Date.now().toString(),
            title: cleanTitle,
            progress: 0,
            completed: false,
            createdAt: new Date().toISOString(),
            priority: (() => {
                const validPriorities = ['High', 'Medium', 'Low'];
                if (typeof priority !== 'string' || priority.length === 0) return 'Medium';
                const normalizedPriority = priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
                return validPriorities.includes(normalizedPriority) ? normalizedPriority : 'Medium';
            })(),
            deadline: deadline || null,
            duration: parseInt(duration) || 0,
            notes: sanitizeStr(notes || '', 2000),
            subtasks: [],
            tags: Array.isArray(tags) ? tags.slice(0, 5).map(t => sanitizeStr(t, 30)) : [],
            recurrence: recurrence || null,
            progress_history: [],
            shareToken: Math.random().toString(36).slice(2, 10)
        };

        const goals = readGoals();
        goals.push(newGoal);
        writeGoals(goals);
        res.status(201).json(newGoal);
    } catch (err) {
        console.error("API Error (POST /api/goals):", err.message);
        res.status(500).json({ error: "An internal server error occurred while creating the goal." });
    }
});

// ── DELETE a goal ──────────────────────────────────────────────────────────
app.delete('/api/goals/:id', (req, res) => {
    try {
        const { id } = req.params;
        let goals = readGoals();
        const initialCount = goals.length;
        goals = goals.filter(g => g.id !== id);

        if (goals.length < initialCount) {
            writeGoals(goals);
            res.json({ success: true, message: 'Goal deleted' });
        } else {
            res.status(404).json({ error: "Goal not found" });
        }
    } catch (err) {
        console.error("API Error (DELETE /api/goals/:id):", err.message);
        res.status(500).json({ error: "Failed to delete the goal." });
    }
});

// ── PUT update a goal (progress, completion, notes, deadline, title, tags, recurrence) ──
app.put('/api/goals/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { progress, completed, notes, deadline, title, tags, recurrence } = req.body;

        let goals = readGoals();
        const goalIndex = goals.findIndex(g => g.id === id);
        if (goalIndex === -1) return res.status(404).json({ error: "Goal not found" });

        const goal = goals[goalIndex];

        // Update title if provided
        if (title !== undefined) {
            const cleanTitle = sanitizeStr(title, 150);
            if (cleanTitle) goal.title = cleanTitle;
        }

        // Only apply manual progress/completed if no subtasks exist
        const hasSubtasks = (goal.subtasks || []).length > 0;
        if (!hasSubtasks) {
            if (progress !== undefined) {
                const newProg = Math.min(100, Math.max(0, parseInt(progress) || 0));
                // Save progress history snapshot
                if (!goal.progress_history) goal.progress_history = [];
                const today = new Date().toISOString().slice(0, 10);
                const lastEntry = goal.progress_history[goal.progress_history.length - 1];
                if (!lastEntry || lastEntry.date !== today) {
                    goal.progress_history.push({ date: today, progress: newProg });
                    if (goal.progress_history.length > 30) goal.progress_history.shift(); // Keep last 30 days
                } else {
                    lastEntry.progress = newProg; // Update todays entry
                }
                goal.progress = newProg;
                goal.completed = newProg === 100;
            }
            if (completed !== undefined) {
                goal.completed = !!completed;
                if (completed) goal.progress = 100;
            }
        }

        if (notes !== undefined) goal.notes = sanitizeStr(notes, 2000);
        if (deadline !== undefined) goal.deadline = deadline;
        if (tags !== undefined && Array.isArray(tags)) goal.tags = tags.slice(0, 5).map(t => sanitizeStr(t, 30));
        if (recurrence !== undefined) goal.recurrence = recurrence;

        writeGoals(goals);
        res.json(goal);
    } catch (err) {
        console.error("API Error (PUT /api/goals/:id):", err.message);
        res.status(500).json({ error: "Failed to update the goal." });
    }
});

// ── PATCH — subtask operations: add, toggle, delete ──────────────────────
app.patch('/api/goals/:id/subtasks', (req, res) => {
    try {
        const { id } = req.params;
        const { action, subtaskId, title } = req.body;

        let goals = readGoals();
        const gi = goals.findIndex(g => g.id === id);
        if (gi === -1) return res.status(404).json({ error: "Goal not found" });

        if (!goals[gi].subtasks) goals[gi].subtasks = [];

        if (action === 'add') {
            const cleanTitle = sanitizeStr(title, 80);
            if (!cleanTitle) return res.status(400).json({ error: "Subtask title required" });
            goals[gi].subtasks.push({
                id: Date.now().toString(),
                title: cleanTitle,
                completed: false,
                createdAt: new Date().toISOString()
            });
        } else if (action === 'toggle') {
            const st = goals[gi].subtasks.find(s => s.id === subtaskId);
            if (st) st.completed = !st.completed;
        } else if (action === 'delete') {
            goals[gi].subtasks = goals[gi].subtasks.filter(s => s.id !== subtaskId);
        }

        // Recalculate progress from subtasks
        const total = goals[gi].subtasks.length;
        if (total > 0) {
            const done = goals[gi].subtasks.filter(s => s.completed).length;
            const newProg = Math.round((done / total) * 100);
            // Track history
            if (!goals[gi].progress_history) goals[gi].progress_history = [];
            const today = new Date().toISOString().slice(0, 10);
            const lastEntry = goals[gi].progress_history[goals[gi].progress_history.length - 1];
            if (!lastEntry || lastEntry.date !== today) {
                goals[gi].progress_history.push({ date: today, progress: newProg });
                if (goals[gi].progress_history.length > 30) goals[gi].progress_history.shift();
            } else {
                lastEntry.progress = newProg;
            }
            goals[gi].progress = newProg;
            goals[gi].completed = done === total;
        }

        writeGoals(goals);
        res.json(goals[gi]);
    } catch (err) {
        console.error("API Error (PATCH /api/goals/:id/subtasks):", err.message);
        res.status(500).json({ error: "Failed to update subtasks." });
    }
});

// ── PATCH — reorder goals (drag & drop persistence) ──────────────────────
app.patch('/api/goals/reorder', (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
        let goals = readGoals();
        const sorted = orderedIds.map(id => goals.find(g => g.id === id)).filter(Boolean);
        const rest   = goals.filter(g => !orderedIds.includes(g.id));
        writeGoals([...sorted, ...rest]);
        res.json({ success: true });
    } catch (err) {
        console.error("API Error (PATCH /api/goals/reorder):", err.message);
        res.status(500).json({ error: "Failed to reorder goals." });
    }
});

// ── POST Generate AI Tip ──────────────────────────────────────────────────
app.post('/api/goals/:id/generate-tip', async (req, res) => {
    let goals = readGoals();
    const gi = goals.findIndex(g => g.id === req.params.id);
    if (gi === -1) return res.status(404).json({ error: 'Goal not found' });
    const goal = goals[gi];

    if (goal.aiTip) return res.json({ tip: goal.aiTip });

    if (!GROQ_KEY) return res.status(500).json({ error: "GROQ_API_KEY not configured" });

    const prompt = `Provide a single, very concise, highly actionable sentence (max 15 words) giving a strategic tip on how to accomplish the following goal. DO NOT prefix the tip, just write the tip itself.\n\nGoal: "${goal.title}"\nPriority: ${goal.priority}\nProgress: ${goal.progress}%`;

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        if (!groqRes.ok) throw new Error(`Groq API error: ${groqRes.status}`);
        const data = await groqRes.json();
        const tip = data.choices[0].message.content.trim().replace(/^"|"$/g, '');

        goals[gi].aiTip = tip;
        writeGoals(goals);
        res.json({ tip });
    } catch (err) {
        console.error("Tip Gen Error:", err.message);
        res.status(500).json({ error: "Failed to generate AI tip" });
    }
});

// ── POST AI Goal Breakdown — generate subtasks from goal title ────────────
app.post('/api/goals/:id/ai-breakdown', async (req, res) => {
    let goals = readGoals();
    const gi = goals.findIndex(g => g.id === req.params.id);
    if (gi === -1) return res.status(404).json({ error: 'Goal not found' });
    const goal = goals[gi];

    if (!GROQ_KEY) return res.status(500).json({ error: "GROQ_API_KEY not configured" });

    const prompt = `Break this goal into exactly 4-5 specific, actionable subtasks. Return ONLY a JSON array of strings (subtask titles), no other text.\n\nGoal: "${goal.title}"`;

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.5
            })
        });

        if (!groqRes.ok) throw new Error(`Groq API error: ${groqRes.status}`);
        const data = await groqRes.json();
        const raw = data.choices[0].message.content.trim();
        // Extract JSON array from response
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('No JSON array found');
        const subtaskTitles = JSON.parse(match[0]).slice(0, 5);

        // Add subtasks to goal
        const newSubtasks = subtaskTitles.map(title => ({
            id: (Date.now() + Math.random()).toString(),
            title: sanitizeStr(String(title), 80),
            completed: false,
            createdAt: new Date().toISOString()
        }));
        goals[gi].subtasks = [...(goals[gi].subtasks || []), ...newSubtasks];
        writeGoals(goals);
        res.json({ subtasks: newSubtasks, goal: goals[gi] });
    } catch (err) {
        console.error("AI Breakdown Error:", err.message);
        res.status(500).json({ error: "Failed to generate breakdown" });
    }
});

// ── GET shared goal (public read-only) ────────────────────────────────────
app.get('/api/share/:token', (req, res) => {
    const { token } = req.params;
    const goals = readGoals();
    const goal = goals.find(g => g.shareToken === token);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    // Return safe subset only
    const { id, title, progress, completed, priority, deadline, subtasks, createdAt, progress_history, tags } = goal;
    res.json({ id, title, progress, completed, priority, deadline, subtasks, createdAt, progress_history, tags });
});

// ── POST Chat (Groq API) with multi-turn history ──────────────────────────
app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    if (!GROQ_KEY) {
        return res.status(500).json({ error: "GROQ_API_KEY not configured on server" });
    }

    // Inject goals into the system prompt for context-awareness
    const goals = readGoals();
    const pendingGoals = goals.filter(g => !g.completed).map(g => `- ${g.title} (${g.priority} priority, ${g.progress}% done)`).join('\n');
    let systemPrompt = "You are a smart, friendly productivity assistant helping users manage goals. Keep responses natural, helpful, and concise.";
    if (goals.length > 0) {
        systemPrompt += `\n\nHere are the user's current goals:\n${pendingGoals || 'None pending!'}\n\nHelp them based on this data.`;
    }

    // Build multi-turn messages (last 6 exchanges max)
    const messages = [{ role: "system", content: systemPrompt }];
    if (Array.isArray(history)) {
        history.slice(-12).forEach(msg => {
            if (msg.role && msg.content) messages.push({ role: msg.role, content: String(msg.content).slice(0, 2000) });
        });
    }
    messages.push({ role: "user", content: message });

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages
            })
        });

        if (!groqRes.ok) {
            const errData = await groqRes.json();
            console.error("GROQ Payload Error:", JSON.stringify(errData, null, 2));
            throw new Error(`Groq API returned ${groqRes.status}`);
        }

        const data = await groqRes.json();
        const aiMessage = data.choices[0].message.content;
        res.json({ reply: aiMessage });

    } catch (err) {
        console.error("Groq API Error:", err.message);
        res.status(500).json({ error: "Failed to fetch from Groq API" });
    }
});

// ── Serve share page ──────────────────────────────────────────────────────
app.get('/share/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// Serve index.html for SPA routes (but not for static HTML files)
app.get('*', (req, res) => {
    const htmlPages = ['/login.html', '/signup.html', '/about.html', '/contact.html'];
    if (htmlPages.includes(req.path)) {
        return res.sendFile(path.join(__dirname, 'public', req.path.slice(1)));
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`Server running smoothly on http://localhost:${PORT}`);
    initializeServer();
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[Error] Port ${PORT} is already in use by another process.`);
        process.exit(1);
    } else {
        console.error(`[Error] Server error:`, err.message);
    }
});
