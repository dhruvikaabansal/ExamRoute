import { beforeAll, afterEach, afterAll } from 'vitest';
import { dbReady, connectTestDb, wipeTestDb, disconnectTestDb } from './db.js';

/**
 * Per-file database lifecycle.
 *
 * Vitest runs a setup file once for every test file, so hooks registered here
 * belong to that file. That matters because the suite runs with
 * `isolate: false` for speed: the module graph is shared, so anything
 * registered at module scope inside an imported helper would attach only to
 * the file that happened to import it first.
 *
 * Connect before the file, empty the collections after every test, disconnect
 * on the way out. Files that need no database simply never connect, because
 * `dbReady` is false when no MongoDB was reachable.
 */
if (dbReady) {
  beforeAll(connectTestDb);
  afterEach(wipeTestDb);
  afterAll(disconnectTestDb);
}
