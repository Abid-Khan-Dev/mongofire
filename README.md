# 🔥 MongoFire

> **Offline-first MongoDB sync** — Local + Atlas feel like ONE database.
> Drop-in production setup, automatic connection management, zero boilerplate.

[![npm version](https://img.shields.io/npm/v/mongofire)](https://www.npmjs.com/package/mongofire)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is MongoFire?

MongoFire keeps a **local MongoDB** and **MongoDB Atlas** in sync — automatically, reliably, and with zero boilerplate. Your app reads and writes to a local MongoDB instance that is always fast and always available, even when offline. MongoFire handles the rest in the background.

> ⚡ **MongoFire manages every MongoDB connection for you.**
> You never call `mongoose.connect()`. You never call `app.listen()` directly.
> You import two functions — `startApp` and `plugin` — and everything else is automatic.

**Features:**
- **Offline-first** — your app never waits for the network
- **Zero-config connection** — local MongoDB connects automatically on import
- **`startApp(app, port)`** — replaces `app.listen()`, waits for DB, then opens the server
- **Automatic sync** — uploads local changes and downloads remote ones on a configurable interval
- **Real-time mode** — optional Atlas Change Streams for near-instant propagation
- **Conflict resolution** — deterministic last-writer-wins with version tracking
- **Per-field merge** — field-level LWW prevents data loss when devices edit different fields simultaneously
- **Resumable bootstrap** — first sync streams from Atlas in batches, survives crashes
- **Self-healing** — detects and recovers lost writes caused by crashes or local DB resets
- **Auto-spawn mongod** — if MongoDB is not running, MongoFire starts it automatically
- **CLI tools** — interactive commands for status, conflicts, reconciliation, and safe reset
- **TypeScript** — full type declarations included

---

## Installation

```bash
npm install mongofire
```

**Peer dependencies** (install once in your project):

```bash
npm install mongodb mongoose dotenv
```

---

## Quick Start (3 steps)

### Step 1 — Run the setup wizard

```bash
npx mongofire init
```

This creates three files in your project root:

| File | Purpose |
|---|---|
| `.env` | MongoDB connection strings |
| `mongofire.config.js` | Collections to sync, intervals, options |
| `mongofire.js` | The MongoFire entry point — **do not delete** |

### Step 2 — Fill in `.env`

```env
ATLAS_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/
LOCAL_URI=mongodb://127.0.0.1:27017
DB_NAME=myapp
```

> `ATLAS_URI` is optional — omit it to run in local-only mode during development.

### Step 3 — Use MongoFire in your project

**`server.js` — your Express entry point:**

```js
// ESM
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { startApp } from './mongofire.js';   // ← import from YOUR mongofire.js

import authRoutes    from './routes/auth.routes.js';
import studentRoutes from './routes/student.routes.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

app.use('/auth',     authRoutes);
app.use('/students', studentRoutes);

// ✅ Replaces app.listen() — waits for local DB then starts the server
startApp(app, process.env.PORT || 3000);
```

```js
// CommonJS
const express = require('express');
const { startApp } = require('./mongofire');

const app = express();
app.use(express.json());

app.use('/auth', require('./routes/auth.routes'));

startApp(app, process.env.PORT || 3000);
```

**`models/User.js` — attach the plugin to your Mongoose schemas:**

```js
// ESM — from a file inside models/
import mongoose from 'mongoose';
import { plugin } from '../mongofire.js';   // ← note: ../ because models/ is one level deep

const UserSchema = new mongoose.Schema({
  name:      String,
  email:     { type: String, unique: true },
  updatedAt: Date,
});

UserSchema.plugin(plugin('users'));  // collection name must match mongofire.config.js

export default mongoose.model('User', UserSchema);
```

```js
// CommonJS — from a file inside models/
const mongoose = require('mongoose');
const { plugin } = require('../mongofire');   // ← note: ../ one level up

const StudentSchema = new mongoose.Schema({
  name:      String,
  grade:     Number,
  updatedAt: Date,
});

StudentSchema.plugin(plugin('students'));

module.exports = mongoose.model('Student', StudentSchema);
```

> **Critical:** The import path is always a **relative path** to `mongofire.js` in your project root.
> It is **never** `'mongofire'` (the npm package name).
> From `server.js` (root) → `'./mongofire.js'`
> From `models/User.js` (one level deep) → `'../mongofire.js'`

---

## Project folder structure

```
backend/
├── mongofire.js          ← Generated by init — the bridge between your app and MongoFire
├── mongofire.config.js   ← Your sync configuration
├── .env                  ← Connection strings (never commit this)
├── server.js             ← import { startApp } from './mongofire.js'
├── models/
│   ├── User.js           ← import { plugin } from '../mongofire.js'
│   └── Student.js        ← import { plugin } from '../mongofire.js'
└── routes/
    ├── auth.routes.js
    └── student.routes.js
```

---

## What `startApp()` does

`startApp(app, port)` replaces `app.listen()`. It:

1. Waits for local MongoDB to be fully connected
2. Calls `app.listen(port)` only after the DB is ready
3. Logs `🚀 [MongoFire] Server ready on port <port>` on success
4. If the local DB fails: logs a descriptive error and exits with code 1

**Console output on startup:**

```
✅ [MongoFire] Local MongoDB connected
🚀 [MongoFire] Server ready on port 3000
🌐 [MongoFire] Atlas connected — sync active
🔄 [MongoFire] Sync complete — ↑2 uploaded  ↓5 downloaded  🗑 0 deleted
```

---

## Config Options (`mongofire.config.js`)

```js
export default {
  localUri:  process.env.LOCAL_URI || 'mongodb://127.0.0.1:27017',
  atlasUri:  process.env.ATLAS_URI,
  dbName:    process.env.DB_NAME   || 'myapp',

  collections: ['users', 'students', 'orders'],  // every collection your app uses

  syncInterval: 30000,   // ms between sync cycles (minimum 500)
  batchSize:    200,
  syncOwner:    '*',     // '*' = sync all  |  'userId' = per-user isolation
  realtime:     false,   // true = Atlas Change Streams
  cleanDays:    7,

  onSync(result) {
    if (result.uploaded + result.downloaded + result.deleted > 0)
      console.log(`Synced: ↑${result.uploaded} ↓${result.downloaded}`);
  },
  onError(err) { console.error('Sync error:', err.message); },
};
```

| Option              | Type           | Default                              | Description                                             |
|---------------------|----------------|--------------------------------------|---------------------------------------------------------|
| `collections`       | `string[]`     | **required**                         | Collection names to sync                                |
| `localUri`          | `string`       | `'mongodb://127.0.0.1:27017'`        | Local MongoDB URI                                       |
| `atlasUri`          | `string`       | `null`                               | Atlas URI. Omit for local-only mode                     |
| `dbName`            | `string`       | `'myapp'`                            | Database name                                           |
| `syncInterval`      | `number`       | `30000` (`5000` if `realtime:true`)  | Polling interval in ms (minimum: 500)                   |
| `batchSize`         | `number`       | `200`                                | Documents per batch (1–10 000)                          |
| `syncOwner`         | `string\|fn`   | `'*'`                                | Owner filter — see Multi-Tenant section                 |
| `realtime`          | `boolean`      | `false`                              | Enable Atlas Change Streams                             |
| `cleanDays`         | `number`       | `7`                                  | Auto-clean synced records older than N days             |
| `onSync`            | `function`     | `null`                               | Called after each sync cycle                            |
| `onError`           | `function`     | `null`                               | Called when a sync cycle throws                         |
| `reconcileOnStart`  | `boolean`      | `true`                               | Scan for lost writes at startup                         |

---

## Common import mistakes

### ❌ Wrong — using the npm package name

```js
import { plugin } from 'mongofire';       // ❌ ERR_MODULE_NOT_FOUND
const { plugin } = require('mongofire');  // ❌ wrong unless mongofire is installed globally
```

### ✅ Correct — relative path to your local mongofire.js

```js
// server.js (same folder as mongofire.js)
import { startApp, plugin } from './mongofire.js';

// models/User.js (one folder deep)
import { plugin } from '../mongofire.js';

// routes/user.routes.js (one folder deep)
import { plugin } from '../mongofire.js';
```

---

## Events

```js
import { mongofire } from './mongofire.js';

mongofire.on('localReady', () => console.log('Local DB connected'));
mongofire.on('online',     () => console.log('Atlas connected'));
mongofire.on('offline',    () => console.log('Working offline'));
mongofire.on('sync',       (r) => console.log('Synced:', r));
mongofire.on('conflict',   (c) => console.warn('Conflict:', c));
mongofire.on('error',      (e) => console.error('Error:', e));
mongofire.on('stopped',    ()  => console.log('Shut down cleanly'));
```

| Event              | Payload                        | When emitted                           |
|--------------------|--------------------------------|----------------------------------------|
| `localReady`       | `Db`                           | Local MongoDB connected (before Atlas) |
| `ready`            | —                              | `start()` fully completed              |
| `online`           | —                              | Atlas connected                        |
| `offline`          | —                              | Atlas becomes unreachable              |
| `sync`             | `SyncResult`                   | After each sync cycle                  |
| `conflict`         | `ConflictData`                 | Local write conflicts with remote      |
| `conflictResolved` | `{ opId, resolution }`         | After retry or dismiss                 |
| `stopped`          | —                              | `stop()` finished                      |
| `error`            | `Error`                        | Unexpected sync error                  |

---

## API Reference

### `startApp(app, port)` → `Promise<http.Server>`

Replaces `app.listen()`. Waits for local DB, then opens the server port. Exits with code 1 on DB failure.

```js
import { startApp } from './mongofire.js';
startApp(app, process.env.PORT || 3000);
```

### `plugin(collectionName, options?)` → Mongoose plugin function

Attaches change-tracking to a schema. Apply **before** `mongoose.model()`.

```js
import { plugin } from '../mongofire.js';
UserSchema.plugin(plugin('users'));
UserSchema.plugin(plugin('users', { ownerField: 'userId' }));  // multi-tenant
```

### `localReady` → `Promise<Db>`

Resolves as soon as local MongoDB is connected, before Atlas.

```js
import { localReady } from './mongofire.js';
await localReady;  // DB is guaranteed ready after this
```

### `ready` → `Promise<MongoFire>`

Resolves after Atlas connect and the first sync.

### `mongofire.sync(type?)` → `Promise<SyncResult>`

Manually trigger a sync (`'required'` or `'all'`).

### `mongofire.status()` → `Promise<SyncStatus>`

Returns `{ online, pending, creates, updates, deletes, realtime }`.

### `mongofire.conflicts()` / `retryConflict(opId)` / `dismissConflict(opId)`

View and resolve sync conflicts.

### `mongofire.reconcile(opts?)` → `Promise<ReconcileResult[]>`

Scan for and recover writes lost in a crash.

### `mongofire.resetLocal()` → `Promise<{ dropped: number }>`

Wipe the local DB. Next startup re-bootstraps from Atlas. **Unsynced changes are lost.**

### `mongofire.stop(timeoutMs?)` → `Promise<void>`

Flush in-flight ops and close connections. Called automatically on `SIGINT`/`SIGTERM`.

---

## Real-Time Sync

```js
// mongofire.config.js
export default {
  atlasUri:     process.env.ATLAS_URI,
  collections:  ['orders'],
  realtime:     true,    // requires Atlas M10+ or a local replica set
  syncInterval: 5000,    // polling fallback
};
```

Falls back to polling if Change Streams are unavailable. Saves a resume token — restarts pick up exactly where they left off. Restarts use exponential backoff (2 s → 60 s).

---

## Multi-Tenant

For apps where each user must only sync their own data:

```js
// mongofire.config.js
export default {
  collections: ['notes'],
  syncOwner: () => currentUserId,  // returns the current user's ID
};
```

```js
// model
NoteSchema.plugin(plugin('notes', { ownerField: 'userId' }));
```

```js
// create — always set the owner field
await Note.create({ title: 'My note', userId: req.user._id });
```

---

## CLI Reference

```bash
npx mongofire init                          # Setup wizard (creates mongofire.js, config, .env)
npx mongofire init --force                  # Overwrite existing files
npx mongofire init --esm                    # Force ESM output
npx mongofire init --cjs                    # Force CJS output
npx mongofire config                        # Update config interactively
npx mongofire status                        # Show pending sync counts
npx mongofire clean --days=7                # Delete records older than 7 days
npx mongofire conflicts                     # View and resolve conflicts
npx mongofire reconcile                     # Recover writes lost from crashes
npx mongofire reconcile --collection=users  # Single collection
npx mongofire reset-local                   # Wipe local DB and re-bootstrap
```

> Set `MONGOFIRE_DEBUG=1` for full error stack traces.

---

## TypeScript

```ts
import { startApp, plugin, mongofire } from './mongofire.js';
import type { SyncResult, ConflictData } from 'mongofire';

UserSchema.plugin(plugin('users'));
startApp(app, 3000);

mongofire.on('sync', (result: SyncResult) => {
  console.log(`↑${result.uploaded} ↓${result.downloaded}`);
});
```

---

## Environment Variables

| Variable                           | Default                  | Description                                          |
|------------------------------------|--------------------------|------------------------------------------------------|
| `ATLAS_URI`                        | —                        | MongoDB Atlas connection string                      |
| `LOCAL_URI`                        | `mongodb://127.0.0.1:27017` | Local MongoDB URI                                 |
| `DB_NAME`                          | `myapp`                  | Database name                                        |
| `MONGOFIRE_DEBUG`                  | unset                    | Set to `1` for full stack traces                     |
| `MONGOFIRE_VERIFY_REMOTE`          | `0`                      | Set to `1` to checksum-verify each uploaded document |
| `MONGOFIRE_COLLECTION_CONCURRENCY` | `4`                      | Collections synced in parallel (max 32)              |
| `MONGOFIRE_DBPATH`                 | `~/.mongofire/<dbName>`  | Data directory for auto-spawned mongod               |

---

## Troubleshooting

### `ERR_MODULE_NOT_FOUND: Cannot find package 'mongofire'`

You are importing `from 'mongofire'` instead of `from './mongofire.js'`.

```js
// ❌ Wrong
import { plugin } from 'mongofire';

// ✅ Correct (from project root)
import { plugin } from './mongofire.js';

// ✅ Correct (from models/ folder)
import { plugin } from '../mongofire.js';
```

### `mongoose.connect() should not be called`

Remove any `mongoose.connect()` calls from your code. MongoFire manages the connection through `localUri` in `mongofire.config.js`.

### `Local MongoDB failed to connect`

- MongoDB is not installed — [download here](https://www.mongodb.com/try/download/community)
- `mongod` is not in your system PATH
- `LOCAL_URI` in `.env` is incorrect
- Port 27017 is blocked by a firewall

MongoFire tries to auto-spawn `mongod`. Set `MONGOFIRE_DBPATH` to a writable directory if the default fails.

### `Cannot find module './mongofire.config.js'`

Run `npx mongofire init` to regenerate the config file.

---

## License

MIT — see [LICENSE](LICENSE)
