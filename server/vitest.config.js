import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Environment defaults, applied before any module reads process.env.
    setupFiles: ['./tests/env.js'],
    // Starts one MongoDB for the whole run and hands its URI to the workers.
    globalSetup: ['./tests/globalSetup.js'],
    // The integration suite shares that database and wipes collections between
    // tests, so files run sequentially rather than racing each other.
    fileParallelism: false,
    // Test files share one worker and one module graph. Re-importing the full
    // dependency tree per file dominated the runtime, and the suite has no
    // cross-file state to protect: the integration specs share a single
    // database that is wiped between tests anyway.
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
