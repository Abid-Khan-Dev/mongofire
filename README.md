# 🔥 MongoFire

> **Offline-first MongoDB sync** — Local + Atlas feel like ONE database.  
> Automatic conflict resolution, Mongoose plugin, zero boilerplate.

[![npm version](https://img.shields.io/npm/v/mongofire)](https://www.npmjs.com/package/mongofire)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What it does

MongoFire keeps a **local MongoDB** and **MongoDB Atlas** in sync automatically.

- Your app reads/writes to local MongoDB — always fast, works offline
- MongoFire tracks every change and uploads to Atlas when online
- Downloads remote changes from Atlas in the background
- If you go offline, changes queue up and sync when you reconnect
- Conflicts resolved automatically (last-writer-wins with version vectors)

---

## Installation

```bash
npm install mongofire
```

**Peer dependencies** (install the ones you use):

```bash
npm install mongodb mongoose
```

---

## Quick Start

### 1. Init config files

```bash
npx mongofire init
```

This creates:
- `.env` — MongoDB connection strings
- `mongofire.config.js` — which collections to sync
- `mongofire.js` — app entry point

### 2. Fill in `.env`

```env
ATLAS_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/
LOCAL_URI=mongodb://127.0.0.1:27017
DB_NAME=myapp
```

### 3. Start sync in your app

```js
// CommonJS
const mongofire = require('mongofire');
const config    = require('./mongofire.config');

await mongofire.start(config);

// ESM
import mongofire from 'mongofire';
import config from './mongofire.config.js';

await mongofire.start(config);
```

### 4. Add the plugin to your Mongoose schema

```js
const mongofire = require('mongofire');

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  userId: mongoose.Types.ObjectId,
});

// Track changes on the 'users' collection
// ownerField: field used for per-user data isolation (multi-tenant)
UserSchema.plugin(mongofire.plugin('users', { ownerField: 'userId' }));

const User = mongoose.model('User', UserSchema);
```

---

## Config Options

| Option | Type | Default | Description |
|---|---|---|---|
| `collections` | `string[]` | *required* | Collection names to sync |
| `localUri` | `string` | `mongodb://localhost:27017` | Local MongoDB URI |
| `atlasUri` | `string` | `null` | Atlas connection string |
| `dbName` | `string` | `'mongofire'` | Database name |
| `syncInterval` | `number` | `30000` (polling) / `5000` (realtime) | Polling interval in ms |
| `batchSize` | `number` | `200` | Docs per upload/download batch |
| `syncOwner` | `string\|fn` | `'*'` | Owner key for multi-tenant filtering. If a function, throwing will **abort** the sync to prevent unintended data access |
| `realtime` | `boolean` | `false` | Use Atlas Change Streams for instant sync |
| `onSync` | `function` | `null` | Called after each sync cycle |
| `onError` | `function` | `null` | Called on sync errors |

---

## Events

```js
mongofire.on('ready',           ()  => console.log('MongoFire started'));
mongofire.on('online',          ()  => console.log('Atlas connected'));
mongofire.on('offline',         ()  => console.log('Working locally'));
mongofire.on('sync',            (r) => console.log('Sync result:', r));
mongofire.on('conflict',        (c) => console.warn('Conflict detected:', c));
mongofire.on('realtimeStarted', ()  => console.log('Change streams active'));
mongofire.on('stopped',         ()  => console.log('Shut down cleanly'));
mongofire.on('error',           (e) => console.error('Sync error:', e));
```

### `conflict` event

Emitted when a local write conflicts with a concurrent remote change. Use this to notify users or trigger a re-fetch:

```js
mongofire.on('conflict', ({ collection, docId, localVersion, remoteVersion, op }) => {
  console.warn(`Conflict on ${collection}/${docId}`);
  console.warn(`  Local was at version ${localVersion}, Atlas is at ${remoteVersion}`);
  // Fetch the latest remote doc and re-apply your changes if needed
});
```

---

## API

### `mongofire.start(config)` → `Promise<MongoFire>`
Connect and start background sync. Concurrent calls are safe — all await the same init.

### `mongofire.stop(timeoutMs?)` → `Promise<void>`
Flush pending ops, wait for active sync, close all connections. Default timeout: 10 seconds.

### `mongofire.sync(type?)` → `Promise<SyncResult>`
Manually trigger a sync. `type` can be `'required'` (default) or `'all'`. Rapid successive calls are throttled automatically.

### `mongofire.status()` → `Promise<SyncStatus>`
Get pending op counts and online/realtime status.

### `mongofire.clean(days?)` → `Promise<number>`
Delete old sync records older than `days` days (default: **7**). Returns count of deleted records.

### `mongofire.plugin(collectionName, options?)`
Returns a Mongoose schema plugin. Options:

| Option | Type | Default | Description |
|---|---|---|---|
| `ownerField` | `string` | `null` | Dot-path to owner key field (e.g. `'userId'` or `'org._id'`) |
| `batchSize` | `number` | `200` | Batch size for bulk operations |
| `concurrency` | `number` | `8` | Concurrent change tracking calls per batch |

---

## Using the plugin directly

If you prefer not to use the MongoFire singleton, import the plugin directly:

```js
// Raw Mongoose plugin
const mongofirePlugin = require('mongofire/plugin');
UserSchema.plugin(mongofirePlugin, { collection: 'users', ownerField: 'userId' });

// Or use the factory helper (same signature as mongofire.plugin())
const { factory } = require('mongofire/plugin');
UserSchema.plugin(factory('users', { ownerField: 'userId' }));
```

---

## Real-Time Sync

Enable instant sync via MongoDB Atlas Change Streams:

```js
await mongofire.start({
  // ...
  realtime: true,   // requires Atlas cluster or local replica set
});
```

If Change Streams are unavailable, MongoFire automatically falls back to polling — no crash, no config needed.

---

## Multi-Tenant Usage

```js
// Sync only data belonging to a specific user
await mongofire.start({
  collections: ['notes', 'tasks'],
  syncOwner: () => currentUser.id,  // dynamic — re-evaluated on each sync cycle
  // ...
});
```

> **Note:** If `syncOwner` throws, the sync is **aborted** and an `error` event is emitted. This prevents unintended access to other users' data.

---

## CLI

```bash
# Create config files in current project
npx mongofire init

# Force overwrite existing config
npx mongofire init --force

# Check pending sync status
npx mongofire status

# Delete old sync records
npx mongofire clean
npx mongofire clean --days=7
```

---

## TypeScript

Full TypeScript support is included:

```ts
import mongofire, { MongoFire, SyncConfig, SyncResult, ConflictData } from 'mongofire';

const config: SyncConfig = {
  collections: ['users'],
  atlasUri: process.env.ATLAS_URI,
  realtime: true,
};

await mongofire.start(config);

mongofire.on('sync', (result: SyncResult) => {
  console.log(`Uploaded: ${result.uploaded}, Downloaded: ${result.downloaded}`);
});

mongofire.on('conflict', (data: ConflictData) => {
  console.warn(`Conflict on ${data.collection}/${data.docId}`);
});
```

---

## How it Works

1. **Change Tracking** — Every `save`/`update`/`delete` via Mongoose hooks is recorded locally before syncing to Atlas
2. **Upload** — Pending local changes are uploaded to Atlas inside MongoDB transactions, with automatic retry and idempotency
3. **Download (Bootstrap)** — First sync streams all remote docs in batches. Resumable — a crash mid-bootstrap picks up from where it left off
4. **Download (Delta)** — Subsequent syncs fetch only changes newer than the last seen position, with no gaps even at millisecond boundaries
5. **Conflict Resolution** — Version number → timestamp → deviceId tiebreaker (deterministic, no coin flip)
6. **Offline** — All reads/writes work locally. Changes queue up and upload automatically when Atlas reconnects

---

## Collection Name Rules

Collection names passed to `mongofire.plugin()` and `config.collections` must:
- Start with a letter or digit
- Contain only letters, digits, underscores (`_`), hyphens (`-`), or dots (`.`)
- **Not** contain a colon (`:`)
- **Not** start with `_mf_` (reserved for MongoFire internal use)

Invalid names throw a clear error at startup.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGOFIRE_VERIFY_REMOTE` | `0` | Set to `1` to verify each uploaded doc with a checksum round-trip |
| `MONGOFIRE_COLLECTION_CONCURRENCY` | `4` | Number of collections synced in parallel |

---

## License

MIT — see [LICENSE](LICENSE)
