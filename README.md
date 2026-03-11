# 🔥 MongoFire

> **Offline-first MongoDB sync** — Local + Atlas feel like ONE database.
> Automatic conflict resolution, Mongoose plugin, interactive CLI, zero boilerplate.

[![npm version](https://img.shields.io/npm/v/mongofire)](https://www.npmjs.com/package/mongofire)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is MongoFire?

MongoFire keeps a **local MongoDB** and **MongoDB Atlas** in sync — automatically, reliably, and with zero boilerplate. Your app reads and writes to a local MongoDB instance that is always fast and always available, even when offline. MongoFire handles everything else in the background.

- **Offline-first** — your app never waits for the network
- **Automatic sync** — uploads local changes and downloads remote ones on a configurable interval
- **Real-time mode** — optional Atlas Change Streams for near-instant propagation
- **Conflict resolution** — deterministic last-writer-wins with version tracking; conflict events for manual handling when needed
- **Resumable bootstrap** — first sync streams from Atlas in batches; survives crashes and resumes exactly where it left off
- **Self-healing** — detects and recovers lost writes caused by crashes, local DB resets, or partial failures automatically
- **CLI tools** — interactive commands for status, conflict resolution, reconciliation, and safe local reset
- **TypeScript** — full type declarations included

---

## Installation

```bash
npm install mongofire
```

**Peer dependencies:**

```bash
npm install mongodb mongoose dotenv
```

---

## Quick Start

### 1. Run the setup wizard

```bash
npx mongofire init
```

The interactive wizard creates three files:

- `.env` — MongoDB connection strings
- `mongofire.config.js` — which collections to sync, intervals, and options
- `mongofire.js` — imports config and starts sync

### 2. Fill in `.env`

```env
ATLAS_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/
LOCAL_URI=mongodb://127.0.0.1:27017
DB_NAME=myapp
```

### 3. Import mongofire.js in your app entry point

```js
// CommonJS
require("./mongofire");
const mongofire = require("mongofire");
```

```js
// ESM
import "./mongofire.js";
import mongofire from "mongofire";
```

### 4. Add the plugin to your Mongoose schemas

```js
const mongofire = require("mongofire");

const OrderSchema = new mongoose.Schema({
  items: Array,
  total: Number,
  updatedAt: Date,
});

OrderSchema.plugin(mongofire.plugin("orders")); // <— must be BEFORE creating the model

const Order = mongoose.model("Order", OrderSchema);
```

Every `save()`, `create()`, `update()`, and `delete()` is now tracked and synced automatically.

---

## Config Options

```js
// mongofire.config.js
module.exports = {
  localUri: process.env.LOCAL_URI || "mongodb://127.0.0.1:27017",
  atlasUri: process.env.ATLAS_URI,
  dbName: process.env.DB_NAME || "myapp",

  collections: ["orders", "products", "users"],

  syncInterval: 30000, // ms between sync cycles (default: 30 s)
  batchSize: 200, // documents per batch
  syncOwner: "*", // '*' = sync all data (default)
  realtime: false, // enable Atlas Change Streams

  onSync(result) {
    if (result.uploaded + result.downloaded + result.deleted > 0) {
      console.log(`Synced: up:${result.uploaded} down:${result.downloaded}`);
    }
  },
  onError(err) {
    console.error("Sync error:", err.message);
  },
};
```

### All config fields

| Option              | Type           | Default                       | Description                                      |
| ------------------- | -------------- | ----------------------------- | ------------------------------------------------ |
| `collections`       | `string[]`     | required                      | Collection names to sync                         |
| `localUri`          | `string`       | `'mongodb://localhost:27017'` | Local MongoDB URI                                |
| `atlasUri`          | `string`       | `null`                        | Atlas URI. Omit for local-only mode              |
| `dbName`            | `string`       | `'mongofire'`                 | Database name                                    |
| `syncInterval`      | `number`       | `30000`                       | Polling interval in ms                           |
| `batchSize`         | `number`       | `200`                         | Documents per upload/download batch              |
| `syncOwner`         | `string \| fn` | `'*'`                         | Owner filter. See [Multi-Tenant](#multi-tenant)  |
| `realtime`          | `boolean`      | `false`                       | Enable Atlas Change Streams for instant sync     |
| `onSync`            | `function`     | `null`                        | Called after each sync cycle with a `SyncResult` |
| `onError`           | `function`     | `null`                        | Called when a sync cycle throws                  |
| `reconcileOnStart`  | `boolean`      | `true`                        | Scan for lost writes at startup                  |
| `reconcileFullScan` | `boolean`      | `true`                        | Include deep phase of reconciliation             |

---

## Events

```js
mongofire.on("ready", () => console.log("MongoFire started"));
mongofire.on("online", () => console.log("Atlas connected"));
mongofire.on("offline", () => console.log("Working locally"));
mongofire.on("sync", (r) => console.log("Sync result:", r));
mongofire.on("conflict", (c) => console.warn("Conflict:", c));
mongofire.on("conflictResolved", (d) => console.log("Resolved:", d.opId));
mongofire.on("reconcileComplete", (r) =>
  console.log("Re-queued:", r.totalQueued),
);
mongofire.on("realtimeStarted", () => console.log("Change streams active"));
mongofire.on("realtimeStopped", () => console.log("Realtime stopped"));
mongofire.on("stopped", () => console.log("Shut down cleanly"));
mongofire.on("error", (e) => console.error("Error:", e));
```

| Event               | Payload                        | When emitted                               |
| ------------------- | ------------------------------ | ------------------------------------------ |
| `ready`             | —                              | `start()` completed                        |
| `online`            | —                              | Atlas connection established               |
| `offline`           | —                              | Atlas becomes unreachable                  |
| `sync`              | `SyncResult`                   | After each sync cycle                      |
| `conflict`          | `ConflictData`                 | Local write conflicts with remote          |
| `conflictResolved`  | `{ opId, resolution }`         | After `retryConflict` or `dismissConflict` |
| `reconcileComplete` | `{ collections, totalQueued }` | After reconciliation scan                  |
| `realtimeStarted`   | —                              | Change streams activated                   |
| `realtimeStopped`   | —                              | Change streams stopped                     |
| `stopped`           | —                              | `stop()` finished                          |
| `error`             | `Error`                        | Unexpected sync error                      |

---

## API

### `mongofire.start(config)` → `Promise<MongoFire>`

Connect to local MongoDB and Atlas, run the initial sync, start background polling. Safe to call multiple times — concurrent calls share the same init promise.

### `mongofire.stop(timeoutMs?)` → `Promise<void>`

Flush any in-flight operations and close all connections. Default timeout: **10,000 ms**.

### `mongofire.sync(type?)` → `Promise<SyncResult>`

Manually trigger a sync. Returns `{ error: 'offline', pending }` when Atlas is unreachable. Throttled to a minimum of 500 ms between calls.

| `type`       | Behaviour                                           |
| ------------ | --------------------------------------------------- |
| `'required'` | Upload pending ops + download new changes (default) |
| `'all'`      | Full bi-directional sync                            |

### `mongofire.status()` → `Promise<SyncStatus>`

```ts
interface SyncStatus {
  online: boolean;
  pending: number; // total unsynced operations
  creates: number;
  updates: number;
  deletes: number;
  realtime: boolean;
}
```

### `mongofire.clean(days?, opts?)` → `Promise<number>`

Delete old synced records to keep the local database tidy.

| Parameter           | Default        | Description                                     |
| ------------------- | -------------- | ----------------------------------------------- |
| `days`              | `7`            | Delete synced records older than N days         |
| `opts.conflictDays` | same as `days` | Delete stale conflict records older than N days |

### `mongofire.conflicts(collection?)` → `Promise<ConflictRecord[]>`

```js
const list = await mongofire.conflicts();
for (const c of list) {
  console.log(`${c.collection}/${c.docId}  op:${c.type}  v${c.version}`);
  console.log("Error:", c.lastError);
}
```

### `mongofire.retryConflict(opId)` → `Promise<void>`

Reset a conflict back to pending so the next sync retries it. Emits `conflictResolved` with `resolution: 'retried'`.

### `mongofire.dismissConflict(opId)` → `Promise<void>`

Dismiss a conflict — remote version wins and the local change is discarded. Emits `conflictResolved` with `resolution: 'dismissed'`.

### `mongofire.reconcile(collectionOrOpts?, opts?)` → `Promise<ReconcileResult[]>`

Scan for writes lost in a crash and re-queue them for sync.

```js
await mongofire.reconcile(); // all collections
await mongofire.reconcile({ fullScan: false }); // fast scan only
await mongofire.reconcile("orders"); // single collection
```

| Phase   | What it checks                                          |
| ------- | ------------------------------------------------------- |
| Phase 1 | Metadata rows with no matching operation entry          |
| Phase 2 | Data documents with no metadata entry (`fullScan` only) |

### `mongofire.resetLocal()` → `Promise<{ dropped: number }>`

Safely wipe the entire local database and all MongoFire state. The next `start()` re-bootstraps from Atlas cleanly.

```js
// Check for unsynced changes first
const { pending } = await mongofire.status();
if (pending > 0) {
  console.warn(`${pending} unsynced operations will be lost`);
}

const { dropped } = await mongofire.resetLocal();
console.log(
  `Wiped ${dropped} collections. Restart to re-bootstrap from Atlas.`,
);
```

> **Warning:** Any unsynced local changes are permanently lost. Use `mongofire.status()` first if you need to verify there is nothing pending.

### `mongofire.plugin(collectionName, options?)`

```js
// Basic
OrderSchema.plugin(mongofire.plugin("orders"));

// With options
UserSchema.plugin(
  mongofire.plugin("users", {
    ownerField: "userId", // required only for multi-tenant
    batchSize: 200,
    concurrency: 8,
  }),
);
```

| Option        | Type     | Default | Description                                           |
| ------------- | -------- | ------- | ----------------------------------------------------- |
| `ownerField`  | `string` | `null`  | Dot-path to owner field. Only needed for multi-tenant |
| `batchSize`   | `number` | `200`   | Batch size for bulk operations                        |
| `concurrency` | `number` | `8`     | Concurrent tracking calls per batch                   |

---

## Real-Time Sync

Enable Atlas Change Streams for near-instant propagation between devices:

```js
await mongofire.start({
  atlasUri: process.env.ATLAS_URI,
  collections: ["orders"],
  realtime: true, // requires Atlas M10+ or a local replica set
  syncInterval: 5000, // polling fallback interval
});

mongofire.on("realtimeStarted", () => console.log("Changes appear instantly"));
```

Falls back to polling automatically if Change Streams are unavailable.

---

## Multi-Tenant

> **Most apps do not need this.**
> If all users share the same data — a café, a team app, a single company — use the default `syncOwner: '*'` and skip this section entirely.

Multi-tenant mode is for apps where **each user must only sync their own private data**.

### Do you need it?

| App type                           | Need multi-tenant?        |
| ---------------------------------- | ------------------------- |
| Café / restaurant system           | No — staff share data     |
| Single-company team app            | No — everyone shares data |
| SaaS with per-tenant isolation     | **Yes**                   |
| Per-user notes / tasks             | **Yes**                   |
| Ride-hailing — each driver's data  | **Yes**                   |
| Multi-school, each school isolated | **Yes**                   |

### Setup (4 steps)

**Step 1 — Add an owner field to every synced model**

```js
const OrderSchema = new mongoose.Schema({
  items: Array,
  total: Number,
  userId: { type: mongoose.Types.ObjectId, required: true },
  updatedAt: Date,
});

OrderSchema.plugin(mongofire.plugin("orders", { ownerField: "userId" }));
```

**Step 2 — Set `syncOwner` in config**

```js
module.exports = {
  collections: ["orders", "products"],
  syncOwner: "userId",
  // ...
};
```

**Step 3 — Pass the current user's ID when starting sync**

```js
async function login(req, res) {
  const user = await User.findOne({ email: req.body.email });
  // ... password check ...

  await mongofire.start({
    ...config,
    syncOwner: user._id.toString(),
  });

  res.json({ token, user });
}

async function logout(req, res) {
  await mongofire.stop();
  res.json({ message: "Logged out" });
}
```

**Step 4 — Always set the owner field when creating documents**

```js
const order = await Order.create({
  items: req.body.items,
  total: req.body.total,
  userId: req.user._id,
});
```

### Dynamic owner using a function

```js
await mongofire.start({
  ...config,
  syncOwner: () => getCurrentUser()?.id ?? null,
});
```

> **Security note:** If `syncOwner` is a function and it throws, the sync is **aborted** and an `error` event is emitted. MongoFire never falls back to syncing all data on error.

---

## Using the plugin directly (without the MongoFire instance)

```js
// CommonJS
const mongofirePlugin = require("mongofire/plugin");
OrderSchema.plugin(mongofirePlugin, { collection: "orders" });

// CommonJS factory
const { factory } = require("mongofire/plugin");
OrderSchema.plugin(factory("orders"));
```

```js
// ESM
import mongofirePlugin, { factory } from "mongofire/plugin";
OrderSchema.plugin(factory("orders"));
```

---

## Safe Local Reset

If the local database is cleared or corrupted, MongoFire automatically detects and resolves any stale pending operations during the next bootstrap — no manual conflict resolution, no stuck queues.

For a deliberate clean reset, use either:

```bash
# Interactive CLI — confirms before wiping
npx mongofire reset-local
```

```js
// Programmatic
const { dropped } = await mongofire.resetLocal();
```

Both drop all local data and MongoFire state so the next startup re-bootstraps from Atlas cleanly.

---

## CLI Reference

```bash
npx mongofire init                               # Interactive setup wizard
npx mongofire init --force                       # Overwrite existing files
npx mongofire init --esm                         # Force ESM output
npx mongofire init --cjs                         # Force CommonJS output
npx mongofire config                             # Update an existing config
npx mongofire status                             # Show pending sync counts
npx mongofire clean                              # Delete old records (interactive)
npx mongofire clean --days=14                    # Delete records older than 14 days
npx mongofire conflicts                          # View and resolve conflicts
npx mongofire reconcile                          # Recover writes lost from crashes
npx mongofire reconcile --no-full-scan           # Fast scan (Phase 1 only)
npx mongofire reconcile --collection=orders      # Single collection
npx mongofire reset-local                        # Safely wipe local DB and re-bootstrap
```

| Command       | Description                                               | TTY required? | Key flags                             |
| ------------- | --------------------------------------------------------- | ------------- | ------------------------------------- |
| `init`        | Setup wizard                                              | Optional      | `--esm`, `--cjs`, `--force`           |
| `config`      | Update an existing config                                 | Yes           | —                                     |
| `status`      | Show pending ops and online state                         | No            | —                                     |
| `clean`       | Delete old sync records                                   | Optional      | `--days=N` (1–3650, default 7)        |
| `conflicts`   | View and resolve conflicts interactively                  | Yes           | —                                     |
| `reconcile`   | Recover writes lost from crashes                          | No            | `--no-full-scan`, `--collection=NAME` |
| `reset-local` | Wipe local DB and all sync state for a clean re-bootstrap | Yes           | —                                     |

> **Tip:** Set `MONGOFIRE_DEBUG=1` for full error stack traces in any command.

---

## TypeScript

```ts
import mongofire, { SyncConfig, SyncResult, ConflictData } from "mongofire";

const config: SyncConfig = {
  collections: ["orders", "products"],
  atlasUri: process.env.ATLAS_URI,
  realtime: true,
};

await mongofire.start(config);

mongofire.on("sync", (result: SyncResult) => {
  console.log(`up:${result.uploaded} down:${result.downloaded}`);
});

mongofire.on("conflict", (c: ConflictData) => {
  console.warn(`Conflict: ${c.collection}/${c.docId} op:${c.op}`);
});
```

---

## Environment Variables

| Variable                           | Default | Description                                          |
| ---------------------------------- | ------- | ---------------------------------------------------- |
| `MONGOFIRE_DEBUG`                  | unset   | Set to `1` for full error stack traces               |
| `MONGOFIRE_VERIFY_REMOTE`          | `0`     | Set to `1` to checksum-verify each uploaded document |
| `MONGOFIRE_COLLECTION_CONCURRENCY` | `4`     | Collections synced in parallel (capped at 32)        |

---

## Collection Name Rules

Names must:

- Start with a letter or digit
- Contain only letters, digits, `_`, `-`, or `.`
- **Not** contain `:` — causes internal key collisions
- **Not** start with `_mf_` — reserved prefix

Invalid names are rejected at startup with a clear error message.

---

## License

MIT — see [LICENSE](LICENSE)
