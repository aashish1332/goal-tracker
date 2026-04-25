const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const compression = require('compression');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_KEY = process.env.GROQ_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'trackerpro-super-secret-key-123';

// Compress responses (gzip)
app.use(compression());
app.use(express.json({ limit: '100kb' }));

// Static assets with intelligent caching
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // HTML: always revalidate (ensures fresh content)
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.match(/\.(js|mjs|css)$/)) {
      // JS/CSS: cache 1 hour, revalidate with ETag after
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    } else if (filePath.match(/\.(woff2?|ttf|eot|otf|ico|png|jpg|jpeg|gif|svg|webp)$/)) {
      // Fonts & images: cache 7 days (rarely change)
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// ── RATE LIMITING ──
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// ── DATABASE SETUP (MONGODB) ──
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trackerpro';
if (process.env.VERCEL) {
    console.log(`[Vercel] MONGODB_URI status: ${process.env.MONGODB_URI ? 'LOADED' : 'NOT FOUND (Check Vercel Dashboard Environment Variables!)'}`);
}

let cachedDb = global.mongoose;
if (!cachedDb) {
    cachedDb = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cachedDb.conn) return cachedDb.conn;
    if (!cachedDb.promise) {
        cachedDb.promise = mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000, // Allow 10s for Vercel cold starts
            maxPoolSize: 5,                  // Keep pool small for serverless
            minPoolSize: 1,
            socketTimeoutMS: 45000,
            bufferCommands: false             // Fail fast instead of buffering
        }).then((mongoose) => {
            console.log(`[DB] Connected to MongoDB efficiently ${process.env.MONGODB_URI ? '(Live)' : '(Local)'}`);
            return mongoose;
        }).catch((err) => {
            // Reset cached promise so next call retries instead of failing forever
            cachedDb.promise = null;
            cachedDb.conn = null;
            throw err;
        });
    }
    cachedDb.conn = await cachedDb.promise;
    return cachedDb.conn;
}

// Ensure DB is connected before any API request is handled
app.use('/api', async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('[DB] Connection Error in Middleware:', err.message);
        res.status(500).json({ error: "Database connection failed. Check your live database settings." });
    }
});

// ── SCHEMAS ──
const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, default: '' },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    dailyMessageCount: { type: Number, default: 0 },
    lastMessageDate: { type: String, default: '' }
});

// We map `_id` to `id` for frontend compatibility, but using existing `id` string works fine for migration.
const goalSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // Keeping string ID for frontend compatibility
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    progress: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    createdAt: { type: String },
    updatedAt: { type: String, default: () => new Date().toISOString() },
    priority: { type: String, default: 'Medium' },
    deadline: { type: String, default: null },
    duration: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    subtasks: { type: Array, default: [] },
    tags: { type: Array, default: [] },
    recurrence: { type: String, default: null },
    progress_history: { type: Array, default: [] },
    shareToken: { type: String },
    aiTip: { type: String },
    aiTipCount: { type: Number, default: 0 },
    orderIndex: { type: Number, default: 0 } // For sorting
});

const statSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);
const Goal = mongoose.model('Goal', goalSchema);
const Stat = mongoose.model('Stat', statSchema);

// ── UTILITIES ──
const sanitizeStr = (s, maxLen = 200) => typeof s === 'string' ? s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen) : '';

// ── AUTH MIDDLEWARE ──
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access token required" });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid or expired token" });
        req.user = user;
        next();
    });
};

// ── MAINTENANCE / CRON ──
const processRecurrence = async () => {
    try {
        await connectDB();
        const today = new Date().toISOString().slice(0, 10);
        const goalsToReset = await Goal.find({ completed: true, recurrence: { $ne: null } });
        for (const g of goalsToReset) {
            const lastUpdate = (g.updatedAt || g.createdAt).slice(0, 10);
            if (lastUpdate < today) {
                g.completed = false;
                g.progress = 0;
                g.subtasks.forEach(st => st.completed = false);
                g.updatedAt = new Date().toISOString();
                await g.save();
                console.log(`[Recurrence] Resetting goal: ${g.title}`);
            }
        }
    } catch (err) { console.error('[Cron] Recurrence err:', err.message); }
};

const takeDailySnapshot = async () => {
    try {
        await connectDB();
        const today = new Date().toISOString().slice(0, 10);
        // Find all users who have active goals
        const users = await User.find({});
        for (const user of users) {
             const alreadyDone = await Stat.findOne({ userId: user._id, date: today });
             if (!alreadyDone) {
                 const goals = await Goal.find({ userId: user._id });
                 const total = goals.length;
                 const score = total > 0 ? Math.round(goals.reduce((a, g) => a + Number(g.progress), 0) / total) : 0;
                 await Stat.create({ userId: user._id, date: today, score, total });
                 
                 // Prune old stats (keep last 30)
                 const oldStats = await Stat.find({ userId: user._id }).sort({ date: -1 }).skip(30);
                 for (const s of oldStats) await Stat.deleteOne({ _id: s._id });
             }
        }
    } catch (err) { console.error('[Cron] Snapshot err:', err.message); }
};

setInterval(() => {
    processRecurrence();
    takeDailySnapshot();
}, 60 * 60 * 1000);

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── GET user limits ──
app.get('/api/user/limits', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        const today = new Date().toISOString().slice(0, 10);
        if (user.lastMessageDate !== today) {
            user.dailyMessageCount = 0;
            user.lastMessageDate = today;
            await user.save();
        }
        res.json({ remainingMessages: Math.max(0, 20 - user.dailyMessageCount) });
    } catch(err) { res.status(500).json({ error: "Failed to fetch limits" }); }
});

// ── AUTH ENDPOINTS ──
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        if (!email || !password || !firstName) return res.status(400).json({ error: 'Missing required fields' });

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({ firstName, lastName, email, password: hashedPassword });
        
        const token = jwt.sign({ userId: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { firstName, email } });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ error: "Failed to create account" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { firstName: user.firstName, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

// ── GET all goals ──
app.get('/api/goals', authenticateToken, async (req, res) => {
    try {
        const goals = await Goal.find({ userId: req.user.userId }).sort({ orderIndex: 1, createdAt: -1 }).lean();
        res.json(goals);
    } catch (err) { res.status(500).json({ error: "Failed to fetch goals" }); }
});

// ── GET snapshots ──
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await Stat.find({ userId: req.user.userId }).sort({ date: 1 }).lean();
        res.json(stats);
    } catch (err) { res.json([]); }
});

// ── POST new goal ──
app.post('/api/goals', authenticateToken, async (req, res) => {
    try {
        const { title, priority, deadline, notes, recurrence, tags, duration } = req.body;
        const cleanTitle = sanitizeStr(title, 150);
        if (!cleanTitle) return res.status(400).json({ error: "Title is required" });

        const maxIndexGoal = await Goal.findOne({ userId: req.user.userId }).sort({ orderIndex: -1 });
        const nextOrderIndex = maxIndexGoal ? maxIndexGoal.orderIndex + 1 : 0;

        const newGoal = {
            id: Date.now().toString(),
            userId: req.user.userId,
            title: cleanTitle,
            progress: 0,
            completed: false,
            createdAt: new Date().toISOString(),
            priority: ['High', 'Medium', 'Low'].includes(priority) ? priority : 'Medium',
            deadline: deadline || null,
            duration: parseInt(duration) || 0,
            notes: sanitizeStr(notes || '', 2000),
            subtasks: [],
            tags: Array.isArray(tags) ? tags.slice(0, 5).map(t => sanitizeStr(t, 30)) : [],
            recurrence: recurrence || null,
            progress_history: [],
            shareToken: Math.random().toString(36).slice(2, 10),
            orderIndex: nextOrderIndex
        };

        const created = await Goal.create(newGoal);
        res.status(201).json(created);
    } catch (err) {
        console.error("POST Goal error:", err);
        res.status(500).json({ error: "Failed to create goal" });
    }
});

// ── DELETE a goal ──
app.delete('/api/goals/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Goal.findOneAndDelete({ id, userId: req.user.userId });
        if (!result) return res.status(404).json({ error: "Goal not found" });
        res.json({ success: true, message: 'Goal deleted' });
    } catch (err) { res.status(500).json({ error: "Failed to delete" }); }
});

// ── PUT update a goal ──
app.put('/api/goals/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        let goal = await Goal.findOne({ id, userId: req.user.userId });
        if (!goal) return res.status(404).json({ error: "Goal not found" });

        if (updates.title !== undefined) {
            const ct = sanitizeStr(updates.title, 150);
            if (ct) goal.title = ct;
        }

        const hasSubtasks = goal.subtasks.length > 0;
        if (!hasSubtasks) {
            if (updates.progress !== undefined) {
                const newProg = Math.min(100, Math.max(0, parseInt(updates.progress) || 0));
                const today = new Date().toISOString().slice(0, 10);
                const lastEntry = goal.progress_history[goal.progress_history.length - 1];
                if (!lastEntry || lastEntry.date !== today) {
                    goal.progress_history.push({ date: today, progress: newProg });
                } else {
                    lastEntry.progress = newProg;
                }
                while (goal.progress_history.length > 30) goal.progress_history.shift();
                goal.progress = newProg;
                goal.completed = newProg === 100;
            }
            if (updates.completed !== undefined) {
                goal.completed = !!updates.completed;
                if (updates.completed) goal.progress = 100;
            }
        }

        if (updates.notes !== undefined) goal.notes = sanitizeStr(updates.notes, 2000);
        if (updates.deadline !== undefined) goal.deadline = updates.deadline;
        if (updates.tags !== undefined && Array.isArray(updates.tags)) goal.tags = updates.tags.slice(0, 5).map(t => sanitizeStr(t, 30));
        if (updates.recurrence !== undefined) goal.recurrence = updates.recurrence;

        goal.updatedAt = new Date().toISOString();
        
        // Mark arrays modified so mongoose saves them properly
        goal.markModified('progress_history');
        goal.markModified('tags');

        await goal.save();
        res.json(goal);
    } catch (err) {
        res.status(500).json({ error: "Failed to update" });
    }
});

// ── PATCH subtasks ──
app.patch('/api/goals/:id/subtasks', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, subtaskId, title } = req.body;
        
        let goal = await Goal.findOne({ id, userId: req.user.userId });
        if (!goal) return res.status(404).json({ error: "Goal not found" });

        if (action === 'add') {
            const cleanTitle = sanitizeStr(title, 80);
            if (!cleanTitle) return res.status(400).json({ error: "Title required" });
            goal.subtasks.push({ id: Date.now().toString(), title: cleanTitle, completed: false, createdAt: new Date().toISOString() });
        } else if (action === 'toggle') {
            const st = goal.subtasks.find(s => s.id === subtaskId);
            if (st) st.completed = !st.completed;
        } else if (action === 'delete') {
            goal.subtasks = goal.subtasks.filter(s => s.id !== subtaskId);
        }

        // Recalculate progress
        const total = goal.subtasks.length;
        if (total > 0) {
            const done = goal.subtasks.filter(s => s.completed).length;
            const newProg = Math.round((done / total) * 100);
            
            const today = new Date().toISOString().slice(0, 10);
            const lastEntry = goal.progress_history[goal.progress_history.length - 1];
            if (!lastEntry || lastEntry.date !== today) {
                goal.progress_history.push({ date: today, progress: newProg });
                if (goal.progress_history.length > 30) goal.progress_history.shift();
            } else {
                lastEntry.progress = newProg;
            }
            goal.progress = newProg;
            goal.completed = done === total;
        }

        goal.markModified('subtasks');
        goal.markModified('progress_history');
        goal.updatedAt = new Date().toISOString();
        await goal.save();

        res.json(goal);
    } catch (err) {
        res.status(500).json({ error: "Failed to update subtasks" });
    }
});

// ── PATCH reorder ──
app.patch('/api/goals/reorder', authenticateToken, async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Array required' });

        for (let i = 0; i < orderedIds.length; i++) {
            await Goal.updateOne({ id: orderedIds[i], userId: req.user.userId }, { $set: { orderIndex: i } });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to reorder" });
    }
});

// AI Tip
app.post('/api/goals/:id/generate-tip', authenticateToken, async (req, res) => {
    try {
        let goal = await Goal.findOne({ id: req.params.id, userId: req.user.userId });
        if (!goal) return res.status(404).json({ error: 'Goal not found' });
        
        if (goal.aiTipCount >= 5) {
            return res.status(429).json({ error: 'Tip limit reached (5/5 tips)' });
        }
        
        if (!GROQ_KEY) return res.status(500).json({ error: "GROQ_API_KEY omitted" });

        const subtasksInfo = goal.subtasks && goal.subtasks.length > 0 
            ? `\nSubtasks: ${goal.subtasks.map(s => s.title + (s.completed ? ' (done)' : ' (pending)')).join(', ')}` 
            : '';
        const prompt = `Provide a single, very concise, highly actionable sentence (max 15 words) giving a strategic tip on how to accomplish the following goal. DO NOT prefix the tip, just write the tip itself.\n\nGoal: "${goal.title}"\nPriority: ${goal.priority}\nProgress: ${goal.progress}%${subtasksInfo}`;

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.7 })
        });
        
        const data = await groqRes.json();
        const tip = data.choices[0].message.content.trim().replace(/^"|"$/g, '');
        
        goal.aiTip = tip;
        goal.aiTipCount = (goal.aiTipCount || 0) + 1;
        await goal.save();
        res.json({ tip, aiTipCount: goal.aiTipCount });
    } catch(err) { res.status(500).json({ error: "AI failed" }); }
});

// AI Breakdown
app.post('/api/goals/:id/ai-breakdown', authenticateToken, async (req, res) => {
    try {
        let goal = await Goal.findOne({ id: req.params.id, userId: req.user.userId });
        if (!goal) return res.status(404).json({ error: 'Goal not found' });
        if (!GROQ_KEY) return res.status(500).json({ error: "GROQ_API_KEY omitted" });

        const prompt = `Break this goal into exactly 4-5 specific, actionable subtasks. Return ONLY a JSON array of strings (subtask titles), no other text.\n\nGoal: "${goal.title}"`;

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.5 })
        });
        
        const data = await groqRes.json();
        const match = data.choices[0].message.content.trim().match(/\[[\s\S]*\]/);
        if(!match) throw new Error("No JSON in AI response");
        const subtaskTitles = JSON.parse(match[0]).slice(0, 5);

        const newSubtasks = subtaskTitles.map(t => ({ id: (Date.now()+Math.random()).toString(), title: sanitizeStr(String(t), 80), completed: false, createdAt: new Date().toISOString() }));
        goal.subtasks.push(...newSubtasks);
        goal.markModified('subtasks');
        await goal.save();
        
        res.json({ subtasks: newSubtasks, goal });
    } catch (err) { res.status(500).json({ error: "AI breakdown failed" }); }
});

// GET shared goal (public read-only, no auth needed)
app.get('/api/share/:token', async (req, res) => {
    const goal = await Goal.findOne({ shareToken: req.params.token });
    if (!goal) return res.status(404).json({ error: 'Not found' });
    const { id, title, progress, completed, priority, deadline, subtasks, createdAt, progress_history, tags } = goal;
    res.json({ id, title, progress, completed, priority, deadline, subtasks, createdAt, progress_history, tags });
});

app.post('/api/chat', authenticateToken, async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message) return res.status(400).json({ error: "Message required" });
        if (!GROQ_KEY) return res.status(500).json({ error: "No GROQ_KEY" });

        // Limit Check
        const user = await User.findById(req.user.userId);
        const today = new Date().toISOString().slice(0, 10);
        if (user.lastMessageDate !== today) {
            user.dailyMessageCount = 0;
            user.lastMessageDate = today;
        }

        if (user.dailyMessageCount >= 20) {
            return res.status(429).json({ error: 'Daily limit reached' });
        }

        user.dailyMessageCount++;
        await user.save();
        const remainingMessages = Math.max(0, 20 - user.dailyMessageCount);

        const goals = await Goal.find({ userId: req.user.userId, completed: false });
        const pending = goals.map(g => `- ${g.title} (${g.priority}, ${g.progress}%)`).join('\n');
        
        let systemPrompt = "You are a smart, friendly productivity assistant helping users manage goals. Keep responses natural, helpful, and concise.";
        if (goals.length > 0) systemPrompt += `\n\nHere are the user's current goals:\n${pending}\n\nHelp them based on this data.`;

        const messages = [{ role: "system", content: systemPrompt }];
        if (Array.isArray(history)) {
            history.slice(-12).forEach(msg => {
                if(msg.role && msg.content) messages.push({ role: msg.role, content: String(msg.content).slice(0, 2000) });
            });
        }
        messages.push({ role: "user", content: String(message).slice(0, 2000) });

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages })
        });
        
        const data = await groqRes.json();
        res.json({ reply: data.choices[0].message.content, remainingMessages });
    } catch(err) { res.status(500).json({ error: "Chat failed" }); }
});

app.get('/share/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'share.html')));

app.get('*', (req, res) => {
    const htmlPages = ['/login.html', '/signup.html', '/about.html', '/contact.html'];
    if (htmlPages.includes(req.path)) return res.sendFile(path.join(__dirname, 'public', req.path.slice(1)));
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only start listening when running locally (not on Vercel serverless)
if (!process.env.VERCEL) {
  const server = app.listen(PORT, async () => {
      console.log(`Server running smoothly on http://localhost:${PORT}`);
      // Connect to DB on startup, then run initial cron
      try {
          await connectDB();
          processRecurrence();
          takeDailySnapshot();
      } catch (err) {
          console.error('[DB] Initial connection failed, will retry on first request:', err.message);
      }
  });

  server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') console.error(`[Error] Port ${PORT} in use.`);
      else console.error(`[Error] Server error:`, err.message);
      process.exit(1);
  });
}

// Export for Vercel serverless
module.exports = app;