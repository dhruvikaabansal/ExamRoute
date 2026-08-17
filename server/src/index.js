import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];

/**
 * Fail fast on missing configuration.
 *
 * Without this, a missing JWT_SECRET does not surface at boot — it surfaces
 * as tokens signed against `undefined`, which is a far worse way to find out.
 * Better to refuse to start with a clear message.
 */
function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`\n❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Copy server/.env.example to server/.env and fill them in.\n');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
    console.error('\n❌ JWT_SECRET must be at least 32 characters in production.\n');
    process.exit(1);
  }
}

async function start() {
  assertEnv();
  await connectDB();

  // Index reconciliation is a migration step, not something to do on every
  // production boot (it can trigger expensive rebuilds under load).
  if (process.env.NODE_ENV !== 'production') {
    try {
      await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    } catch (err) {
      console.warn('Index sync warning:', err.message);
    }
  }

  const app = createApp();
  const port = process.env.PORT || 5000;
  const server = app.listen(port, () =>
    console.log(`🚌 ExamRoute API running on port ${port}`)
  );

  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
