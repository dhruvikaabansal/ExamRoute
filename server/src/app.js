import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { demoMode } from './services/paymentGateway.js';

/**
 * The Express app, built separately from the server that listens on a port.
 *
 * Keeping these apart means the test suite can mount the real application in
 * memory with supertest — no port binding, no race conditions — while
 * `index.js` stays a thin bootstrap.
 */
export function createApp() {
  const app = express();

  // Behind Render/Vercel's proxy, so rate limiting keys off the real client IP
  // rather than seeing every request as coming from the load balancer.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      // An explicit allowlist. The previous `origin: '*'` fallback meant that
      // a missing CLIENT_URL in production silently opened the API to every
      // site on the internet.
      origin: (process.env.CLIENT_URL || 'http://localhost:5173')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(globalLimiter);

  app.get('/', (req, res) => res.json({ ok: true, service: 'ExamRoute API' }));
  app.get('/api/health', (req, res) =>
    res.json({
      ok: true,
      uptime: process.uptime(),
      time: new Date().toISOString(),
      // Advertised so the frontend can tell visitors that payments are
      // simulated, rather than letting them assume they were charged.
      demoMode: demoMode(),
    })
  );

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
