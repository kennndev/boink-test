import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { userRoutes } from './routes/userRoutes.js';
import { stakingRoutes } from './routes/stakingRoutes.js';
import { distributeStakingPoints } from './jobs/dailyPointsDistribution.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up from server directory)
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection with connection pooling for serverless
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/coinflip';

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 1,
})
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
  });

// Routes
app.use('/api/users', userRoutes);
app.use('/api/staking', stakingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Setup staking points distribution cron job
// TESTING: Runs every 5 minutes (change to '0 0 * * *' for daily at midnight UTC in production)
cron.schedule('*/5 * * * *', async () => {
  console.log('[Cron] Running staking points distribution...');
  try {
    const result = await distributeStakingPoints();
    console.log('[Cron] Distribution completed:', result);
  } catch (error) {
    console.error('[Cron] Error in distribution:', error);
  }
}, {
  scheduled: true,
  timezone: "UTC"
});

console.log('⏰ Staking points distribution scheduled (every 5 minutes for TESTING)');

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

