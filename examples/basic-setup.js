'use strict';
/**
 * MongoFire — Basic Setup Example
 * Install: npm install mongofire mongodb mongoose
 */

const mongoose  = require('mongoose');
const mongofire = require('mongofire');

// ── 1. Define your Mongoose schema ────────────────────────────────────────────
const NoteSchema = new mongoose.Schema({
  title:     String,
  body:      String,
  userId:    mongoose.Types.ObjectId,
  updatedAt: { type: Date, default: Date.now },
});

// ── 2. Add the MongoFire plugin ───────────────────────────────────────────────
// This is all you need — MongoFire tracks every save/update/delete automatically
NoteSchema.plugin(mongofire.plugin('notes', {
  ownerField: 'userId',  // optional: isolate data per user (multi-tenant)
}));

const Note = mongoose.model('Note', NoteSchema);

// ── 3. Start MongoFire ────────────────────────────────────────────────────────
async function main() {
  await mongofire.start({
    localUri:  'mongodb://127.0.0.1:27017',
    atlasUri:  process.env.ATLAS_URI,         // from .env
    dbName:    'myapp',
    collections: ['notes'],
    syncInterval: 30000,                      // sync every 30s
  });

  // Connect Mongoose to the same local MongoDB
  await mongoose.connect('mongodb://127.0.0.1:27017/myapp');

  // ── 4. Use your app normally — MongoFire handles sync ────────────────────
  const note = await Note.create({
    title:  'Hello MongoFire',
    body:   'This syncs to Atlas automatically!',
    userId: new mongoose.Types.ObjectId(),
  });
  console.log('Created note:', note._id);

  // Update
  await Note.findByIdAndUpdate(note._id, { title: 'Updated title' });
  console.log('Updated');

  // Delete
  await Note.findByIdAndDelete(note._id);
  console.log('Deleted');

  // ── 5. Listen to events ───────────────────────────────────────────────────
  mongofire.on('sync', (result) => {
    console.log(`Sync done — ↑${result.uploaded} ↓${result.downloaded}`);
  });

  mongofire.on('conflict', ({ collection, docId, localVersion, remoteVersion }) => {
    console.warn(`Conflict on ${collection}/${docId} (local:${localVersion} remote:${remoteVersion})`);
  });

  mongofire.on('offline', () => console.log('Working offline — changes queued'));
  mongofire.on('online',  () => console.log('Back online — syncing...'));
}

main().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongofire.stop();
  await mongoose.disconnect();
  process.exit(0);
});
