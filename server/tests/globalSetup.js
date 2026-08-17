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

// Fail fast rather than retrying a download that will never succeed.
process.env.MONGOMS_DOWNLOAD_RETRIES = process.env.MONGOMS_DOWNLOAD_RETRIES ?? '0';
process.env.MONGOMS_DISABLE_POSTINSTALL = '1';

const STARTUP_TIMEOUT_MS = Number(process.env.MONGO_TEST_TIMEOUT_MS || 60_000);

let memoryServer = null;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms starting MongoDB`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export default async function setup({ provide }) {
  if (process.env.MONGO_TEST_URI) {
    provide('mongoUri', process.env.MONGO_TEST_URI);
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
