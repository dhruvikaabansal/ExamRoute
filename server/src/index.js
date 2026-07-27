import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import routes from './routes/index.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

app.get('/', (req, res) => res.json({ ok: true, service: 'ExamRoute API' }));
app.use('/api', routes);

// basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  // Reconcile DB indexes with the current schemas (drops stale ones like the
  // old unique googleId index, then builds the current sparse index).
  try {
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  } catch (err) {
    console.warn('Index sync warning:', err.message);
  }
  app.listen(PORT, () => console.log(`🚌 ExamRoute API running on port ${PORT}`));
});
