import './env.js';
import { inject } from 'vitest';
import mongoose from 'mongoose';

/**
 * Connection helpers for the integration suite.
 *
 * These are deliberately plain functions with no lifecycle hooks. Hooks
 * registered at module scope in a shared module graph — which is what
 * `isolate: false` gives us — attach to whichever test file imported this
 * module first, and to no other. That produced a suite where the first file
 * disconnected Mongoose on its way out and every later file failed with
 * "Client must be connected", while also silently skipping the between-test
 * cleanup those files were relying on.
 *
 * The hooks now live in `setup.js`, which Vitest runs once per test file, so
 * every file gets its own connect, cleanup and teardown.
 */

const uri = inject('mongoUri');

/**
 * Whether an integration database is available.
 *
 * Synchronous on purpose: `describe.skipIf(!dbReady)` needs an answer while
 * the file is being collected, long before any hook has run.
 */
export const dbReady = Boolean(uri);

let indexesSynced = false;

export async function connectTestDb() {
  if (!dbReady) return;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, {
      // A dedicated database, so pointing MONGO_TEST_URI at a cluster that
      // also holds real data cannot wipe it.
      dbName: 'examroute-test',
      serverSelectionTimeoutMS: 8000,
    });
  }

  // The 2dsphere and unique indexes are part of what these tests assert, so
  // they have to exist before anything runs. Once per process is enough.
  if (!indexesSynced) {
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    indexesSynced = true;
  }
}

/** Empties every collection, so no test depends on another's leftovers. */
export async function wipeTestDb() {
  if (!dbReady || mongoose.connection.readyState !== 1) return;
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

export async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
