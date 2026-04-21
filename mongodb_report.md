# MongoDB Architecture Report
*Project: TrackerPro SaaS*

## 1. Database Overview
We are utilizing a **Local MongoDB Server**.
- **Engine**: MongoDB Community Server
- **Connection URI**: `mongodb://127.0.0.1:27017/trackerpro`
- **Database Name**: `trackerpro`
- **Driver**: We are using **Mongoose** (`mongoose` npm package), which is an Object Data Modeling (ODM) library that provides a rigorous modeling environment for our data, enforcing schema shapes, type-casting, and automatic validation.

## 2. Security & Authentication Layer
Data isolation is the critical difference between a single-user app and a SaaS. We implemented this using a **Relational Approach within a NoSQL structure**:
- **Passwords**: No raw passwords are saved in the database. When someone signs up, we use `bcryptjs` to securely "salt and hash" their password strings before they are saved to the `User` document.
- **Data Isolation (Foreign Keys)**: Every single goal and statistic now contains a `userId` field. This is functionally an `ObjectId` reference pointing back to the creator's `User` document.
- **Endpoint Security**: The server uses a JWT (JSON Web Token) middleware called `authenticateToken`. Every time the frontend asks for data (e.g., getting a list of goals), it must provide a valid cryptographically signed token. The server looks at that token, extracts the `userId` from it safely, and exclusively queries MongoDB for goals where `userId: req.user.userId`. It is impossible for one user to see or modify another user's data.

## 3. Schema Definitions

### A. The User Model (`users` collection)
The core anchor of the multi-user architecture.
```javascript
const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, default: '' },
    email: { type: String, required: true, unique: true }, // unique index prevents duplicate accounts
    password: { type: String, required: true }, // securely hashed
    createdAt: { type: Date, default: Date.now }
});
```

### B. The Goal Model (`goals` collection)
Replaces the old, messy JSON array. Notice the relational binding to the `User`.
```javascript
const goalSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The Relational Lock
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
    orderIndex: { type: Number, default: 0 } 
});
```

### C. The Stat Model (`stats` collection)
Previously, the app kept a single global `stats.json` tracking the overall progress of all goals combined. In a SaaS, stats must be per-user. The server now runs a background cron job once every hour that aggregates data for an individual `userId` and saves it here.
```javascript
const statSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
});
```

## 4. Current Status
The database is actively connected under the `trackerpro` namespace on your local machine. Any new accounts created on the frontend are currently being saved natively into Mongoose structures.
