/**
 * Starts MongoDB once for the whole test run.
 *
 * Doing this per test file meant every file paid the startup cost, and — when
 * the download host is unreachable — every file also paid a failed download,
 * leaving child processes and sockets behind that stopped the runner exiting.
 * A global setup starts at most one server, hands its URI to the workers, and
 * owns the teardown.
 *
 * Resolution order:
 *   1. MONGO_TEST_URI — an instance you already have (local, or a scratch
 *      database on Atlas).
 *   2. mongodb-memory-server — downloads and runs a private mongod.
 *   3. Neither — integration specs skip with a warning rather than failing the
 *      build with an infrastructure error that looks like a code defect.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Fail fast rather than retrying a download that will never succeed.
process.env.MONGOMS_DOWNLOAD_RETRIES = process.env.MONGOMS_DOWNLOAD_RETRIES ?? '0';
process.env.MONGOMS_DISABLE_POSTINSTALL = '1';
/**
 * Pin the version so a machine caches one binary rather than re-fetching
 * 600 MB whenever the upstream default moves.
 *
 * Choose this carefully: changing it invalidates every existing cache and
 * forces a fresh download on every developer machine. Far quicker to avoid
 * the download altogether by setting MONGO_TEST_URI — any MongoDB will do,
 * including a scratch database on the Atlas cluster you already have, since
 * the suite confines itself to a database called `examroute-test`.
 */
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION ?? '7.0.24';

// The first run on a new machine downloads the server, which takes longer
// than starting an already-cached one.
const STARTUP_TIMEOUT_MS = Number(process.env.MONGO_TEST_TIMEOUT_MS || 180_000);

let memoryServer = null;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms starting MongoDB`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Read MONGO_TEST_URI out of a .env file if it is not already exported.
 *
 * The test environment is built explicitly in `tests/env.js` rather than
 * loaded from .env — deliberately, so a stray key in a developer's file
 * cannot change what the suite exercises. The cost is that putting
 * MONGO_TEST_URI in .env silently did nothing, and the suite went off to
 * download 600 MB instead.
 *
 * This reads that one key, parsed without touching process.env, so pointing
 * the suite at an existing database works the obvious way while the rest of
 * the environment stays under the suite's control.
 */
function testUriFromEnvFile() {
  for (const candidate of ['.env', path.join('server', '.env')]) {
    try {
      const parsed = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), candidate)));
      if (parsed.MONGO_TEST_URI) return parsed.MONGO_TEST_URI;
    } catch {
      /* no such file here — try the next one */
    }
  }
  return '';
}

export default async function setup({ provide }) {
  const configured = process.env.MONGO_TEST_URI || testUriFromEnvFile();
  if (configured) {
    provide('mongoUri', configured);
    return;
  }

  // Explicit opt-out, for environments that are known to have no MongoDB and
  // no route to download one. Skips straight to the unit suite instead of
  // spending a minute discovering that.
  if (process.env.SKIP_DB_TESTS === '1') {
    provide('mongoUri', null);
    console.warn('\n⚠️  SKIP_DB_TESTS=1 — running unit tests only.\n');
    return;
  }

  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await withTimeout(MongoMemoryServer.create(), STARTUP_TIMEOUT_MS);
    provide('mongoUri', memoryServer.getUri());
  } catch (err) {
    provide('mongoUri', null);
    // Release anything a partial startup left behind, so the run can exit.
    try {
      await memoryServer?.stop({ force: true, doCleanup: true });
    } catch {
      /* nothing to stop */
    }
    memoryServer = null;

    /**
     * Somewhere it is not acceptable to quietly skip.
     *
     * Skipping when no database exists is right on a laptop — an
     * infrastructure problem should not look like a code defect. But it means
     * a run can pass having tested almost nothing, and in CI that produces a
     * green badge for a suite where the entire integration layer never
     * executed. CI sets REQUIRE_DB=1, so there the absence of a database is
     * a failure rather than a footnote.
     */
    if (process.env.REQUIRE_DB === '1') {
      throw new Error(
        `REQUIRE_DB=1 but no MongoDB could be started: ${String(err.message).split('\n')[0]}\n` +
          'The integration suite is most of this project\'s coverage; refusing to ' +
          'report success without it.'
      );
    }

    console.warn(
      `\n⚠️  Integration tests will be SKIPPED — no MongoDB available.\n` +
        `   ${String(err.message).split('\n')[0]}\n` +
        `   Fix: point the suite at any MongoDB instance, e.g.\n` +
        `        MONGO_TEST_URI="mongodb://127.0.0.1:27017" npm test\n` +
        `   Unit tests (clustering, timing, fares, app wiring) run regardless.\n`
    );
  }
}

export async function teardown() {
  try {
    await memoryServer?.stop({ force: true, doCleanup: true });
  } catch {
    /* already stopped */
  }
}
