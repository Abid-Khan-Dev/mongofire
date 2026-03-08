'use strict';
/**
 * MongoFire — Realtime Sync Example (Atlas Change Streams)
 * Instant sync instead of polling — changes appear in < 1 second
 * Requires: MongoDB Atlas cluster or local replica set
 */

const mongofire = require('mongofire');
const mongoose  = require('mongoose');

const MessageSchema = new mongoose.Schema({
  text:      String,
  from:      String,
  roomId:    String,
  updatedAt: { type: Date, default: Date.now },
});

MessageSchema.plugin(mongofire.plugin('messages'));
const Message = mongoose.model('Message', MessageSchema);

async function main() {
  await mongofire.start({
    localUri:    'mongodb://127.0.0.1:27017',
    atlasUri:    process.env.ATLAS_URI,
    dbName:      'chat',
    collections: ['messages'],
    realtime:    true,   // use Atlas Change Streams (falls back to polling if unavailable)
    syncInterval: 5000,  // polling fallback interval
  });

  await mongoose.connect('mongodb://127.0.0.1:27017/chat');

  mongofire.on('realtimeStarted', () => {
    console.log('⚡ Realtime active — changes appear instantly');
  });

  mongofire.on('sync', (r) => {
    if (r.downloaded > 0) console.log(`📥 ${r.downloaded} new message(s) from Atlas`);
  });

  // Send a message — it uploads to Atlas immediately on next sync
  await Message.create({ text: 'Hello!', from: 'Alice', roomId: 'general' });
  console.log('Message sent');

  // Check status
  const status = await mongofire.status();
  console.log('Status:', status);
}

main().catch(console.error);

process.on('SIGINT', async () => {
  await mongofire.stop();
  process.exit(0);
});
