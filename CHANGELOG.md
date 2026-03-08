# Changelog

All notable changes to MongoFire are documented here.

## [6.5.0] — 2026-03-08

### Fixed — Critical

- **Batch upload data corruption** — operations in the same upload batch could be incorrectly acknowledged, causing sync state to diverge silently. Each operation is now acknowledged individually with its correct status
- **Atlas connection pool leak** — a failed Atlas health check left the underlying connection open, leaking pool connections and causing every subsequent sync to fail with a connection error. Connection is now fully released on failure
- **Delete overwrites concurrent update** — a queued delete could silently overwrite a document that another device had updated in the meantime. This is now detected and surfaced as a `conflict` event instead of data loss
- **Date fields corrupted on sync** — `Date` values in synced documents were being converted to plain ISO strings, breaking date-range queries (`$gt`, `$lt`) on the receiving device. BSON types are now preserved correctly across sync
- **`syncOwner` error grants access to all data** — if the `syncOwner` function threw an error, MongoFire silently fell back to syncing all owners. Now the sync is aborted and an `error` event is emitted, preventing unintended data access

### Fixed — Medium

- **Docker / cloned VM device ID collision** — instances sharing the same MAC address and hostname (e.g. Docker replicas, cloned VMs) generated identical device IDs, causing changes from those devices to be silently skipped on other instances. Device IDs are now always unique
- **`updateOne` hook could track wrong document** — the change tracking hook re-read the document after the update using the original filter, which could match a different document in a concurrent write scenario. The hook now locks on the specific document ID before the update runs
- **Bootstrap restart from scratch on failure** — if a bootstrap sync was interrupted (crash, network drop), the next start re-downloaded all documents from the beginning. Bootstrap now resumes from the last completed checkpoint
- **Sync state and device registry created on Atlas** — two local-only internal collections were being created on Atlas unnecessarily, consuming storage and triggering index maintenance. They are now created on local only

### Fixed — Minor

- **Shared internal object could be accidentally mutated** — an internal configuration object was shared across calls; mutating it in one place could silently affect all subsequent calls. It is now immutable
- **Multiple app instances share one signal handler** — only the first MongoFire instance received `SIGINT`/`SIGTERM` cleanup. Each instance now manages its own handler and removes it on `stop()`, preventing memory leaks in test environments
- **`require('mongofire/plugin')` API inconsistency** — the direct plugin import had a different call signature to `mongofire.plugin()`. Both now work the same way, with a `.factory()` helper added for parity
- **Collection name with special characters causes key collision** — two different collections could produce identical internal keys, leading to metadata corruption. Collection names are now validated at startup with a clear error message

### Fixed — Security

- **Hardware fingerprint stored on Atlas** — a derived MAC address value was being stored in Atlas, accessible to anyone with database read access. This constituted an unnecessary hardware fingerprint. The field has been removed
- **Arbitrary collection names accepted** — collection names were not validated, allowing names that could interfere with MongoFire's internal collections. Names are now validated at startup: no special characters that cause key collisions, no reserved prefixes
- **Oversized documents cause cryptic failure** — documents close to MongoDB's 16MB limit failed with an unhelpful low-level error. MongoFire now checks document size before writing and throws a clear, actionable message
- **Manual `sync()` calls not rate-limited** — a runaway loop calling `sync()` in rapid succession could hammer Atlas with back-to-back requests. Rapid successive calls are now throttled automatically

### Fixed — Performance

- **Checksum computed on every document** — a cryptographic checksum was calculated for every document on every sync cycle regardless of whether verification was enabled. It is now skipped by default and only computed when `MONGOFIRE_VERIFY_REMOTE=1`
- **Bulk update tracking loaded all IDs into memory** — tracking changes for a large `updateMany` operation materialised the full list of matching IDs in memory (100MB+ for millions of documents). The hook now uses a streaming cursor instead
- **Too many database round-trips during upload** — uploading a large backlog of pending changes required many more database queries than necessary. Batch size has been increased significantly, reducing round-trips by ~60%

### Fixed — Reliability

- **Conflicts were silently swallowed** — when a version conflict was detected during upload, it was recorded internally but never surfaced to the application. MongoFire now emits a `conflict` event with structured data so you can respond to it
- **Same-millisecond changes could be missed** — the delta sync cursor used only a timestamp, so two changes with the exact same timestamp could result in one being skipped on the next sync. The cursor now uses a compound position that eliminates this gap

### Added

- **`conflict` event** — emitted when a version conflict is detected during upload, with `{ collection, docId, localVersion, remoteVersion, op }` payload. See Events section in the README
- **`ConflictData` TypeScript interface** — fully typed payload for the `conflict` event
- **`mongofire/plugin` factory export** — `require('mongofire/plugin').factory(name, opts)` matches the `mongofire.plugin()` signature for direct use without the singleton
- **`MONGOFIRE_COLLECTION_CONCURRENCY` env var** — configure how many collections sync in parallel at runtime (default: 4)
- **Startup validation for collection names** — invalid names fail immediately with a clear message instead of silently corrupting data at sync time

### Changed

- `syncInterval` default is now `30000`ms (polling mode) or `5000`ms (when `realtime: true`)
- `clean()` default changed from 30 days → **7 days**, matching the Atlas-side TTL so both sides stay consistent
- `plugin()` `concurrency` option is now actually used (was accepted but ignored in previous versions; default: `8`)
- Device IDs now include random bytes — existing device records are preserved on startup, so this only affects new installations

---

## [6.2.0] — 2026-03-08

### Fixed — Critical
- **`start()` concurrent safety** — multiple simultaneous `start()` calls now share one init promise instead of racing
- **Bootstrap re-trigger bug** — an empty collection no longer forces a full re-bootstrap of all collections
- **Silent change tracking errors** — errors in the Mongoose hooks are now logged instead of swallowed
- **Realtime sync not working** — change stream pipeline fix; was silently delivering zero events on most Atlas clusters

### Fixed — Medium
- **`deleteMany` OOM risk** — plugin now streams and batches docs before deletion; removes 10,000-doc silent cap
- **Session not forwarded in `updateOne` and `deleteOne` hooks** — reads now occur within the same transaction context

### Added
- Full TypeScript declarations (`types/index.d.ts`) with typed events, config, and result interfaces
- `require('mongofire/plugin')` subpath export
- Max retry limit (10 attempts) for permanently failing operations

---

## [6.1.0] — initial release

- Offline-first sync with Local MongoDB + Atlas
- Mongoose plugin with hooks for save, update, delete operations
- Bootstrap + delta oplog sync
- Automatic conflict resolution (version vector + timestamp + deviceId tiebreaker)
- Real-time sync via Atlas Change Streams with polling fallback
- `npx mongofire init / status / clean` CLI
- Exponential backoff retry with jitter
- TTL index auto-cleanup of old sync records
- Multi-tenant `syncOwner` support
