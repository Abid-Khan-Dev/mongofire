'use strict';
/**
 * MongoFire — Multi-Tenant Example
 * Each user only syncs their own data
 */

const mongofire = require('mongofire');
const mongoose  = require('mongoose');

// ── Schema setup ──────────────────────────────────────────────────────────────
const TaskSchema = new mongoose.Schema({
  title:     String,
  done:      Boolean,
  userId:    { type: mongoose.Types.ObjectId, required: true },
  updatedAt: { type: Date, default: Date.now },
});

TaskSchema.plugin(mongofire.plugin('tasks', { ownerField: 'userId' }));
const Task = mongoose.model('Task', TaskSchema);

// ── Current user (from your auth system) ─────────────────────────────────────
let currentUserId = null;

async function main() {
  // Simulate login
  currentUserId = new mongoose.Types.ObjectId();

  await mongofire.start({
    localUri:    'mongodb://127.0.0.1:27017',
    atlasUri:    process.env.ATLAS_URI,
    dbName:      'myapp',
    collections: ['tasks'],
    // syncOwner is re-evaluated on every sync cycle
    // Only this user's tasks are synced — other users' data never touches this device
    syncOwner: () => currentUserId.toString(),
  });

  await mongoose.connect('mongodb://127.0.0.1:27017/myapp');
  console.log(`Syncing tasks for user: ${currentUserId}`);

  const task = await Task.create({
    title:  'Buy groceries',
    done:   false,
    userId: currentUserId,
  });
  console.log('Task created:', task._id);
}

main().catch(console.error);
