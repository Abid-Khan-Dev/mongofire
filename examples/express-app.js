// examples/express-app.js
// Example: Using mongofire in an Express application
//
// Project structure:
//   myproject/
//   ├── mongofire.config.js   ← required
//   ├── .env                  ← required
//   ├── package.json
//   └── server.js             ← this file
//
// package.json:
//   { "dependencies": { "mongofire": "^6.6.0", "mongoose": "^8", "express": "^4", "dotenv": "^16" } }

import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import mongofire, { ready } from 'mongofire';
// ↑ MongoFire auto-starts here — no manual connectDataBase() needed!

// ── Models ───────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  name:  { type: String, required: true },
  email: { type: String, required: true, unique: true },
}, { timestamps: true });

// One line to make all CRUD ops sync to Atlas automatically
userSchema.plugin(mongofire.plugin('users'));

const User = mongoose.model('User', userSchema);

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Routes
app.get('/users',         async (req, res) => res.json(await User.find()));
app.post('/users',        async (req, res) => res.json(await User.create(req.body)));
app.get('/users/:id',     async (req, res) => res.json(await User.findById(req.params.id)));
app.put('/users/:id',     async (req, res) => res.json(await User.findByIdAndUpdate(req.params.id, req.body, { new: true })));
app.delete('/users/:id',  async (req, res) => { await User.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

// Sync endpoints
app.get('/sync/status',   async (req, res) => res.json(await mongofire.status()));
app.post('/sync/trigger', async (req, res) => res.json(await mongofire.sync()));
app.get('/sync/conflicts',async (req, res) => res.json(await mongofire.conflicts()));

// ── Startup ───────────────────────────────────────────────────────────────────

// MongoFire events
mongofire.on('online',  () => console.log('📶 Back online'));
mongofire.on('offline', () => console.log('📴 Offline — writes queued locally'));
mongofire.on('sync',    (r) => {
  if (r.uploaded + r.downloaded + r.deleted > 0)
    console.log(`[Sync] ↑${r.uploaded} ↓${r.downloaded} 🗑${r.deleted}`);
});

// Wait for MongoFire to be ready, then connect Mongoose and start server
await ready;

await mongoose.connect(process.env.LOCAL_URI, { dbName: process.env.DB_NAME });
console.log('🗄  Mongoose connected');

app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
  console.log(`📡 MongoFire online: ${mongofire.online}`);
});
