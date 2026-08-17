import './env.js';
import { inject, afterEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

/**
 * Connects this test file to the MongoDB started once in `globalSetup.js`.
 *
 * The integration suite runs against a real database rather than a mock,
 * because much of what it covers *is* database behaviour: the `2dsphere`
 * index behind `$near` pickup-stop assignment, the unique compound index that
 * prevents double booking, and Mongoose's own casting. A stubbed driver would
 * agree with whatever the code expected and prove nothing.
 *
 * `dbReady` is false when no database could be started; specs that need one
 * are then skipped with `describe.skipIf(!dbReady)` instead of failing.
 */

const uri = inject('mongoUri');

export let dbReady = false;

if (uri) {
  await mongoose.connect(uri, {
    dbName: 'examroute-test',
    serverSelectionTimeoutMS: 8000,
  });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  dbReady = true;

  // Each test starts from an empty database, so ordering never matters.
  afterEach(async () => {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });
}
