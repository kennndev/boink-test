// Vercel serverless function for all /api/staking/* routes
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { stakingRoutes } from '../../server/routes/stakingRoutes.js';

const app = express();

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:8080',
  'https://boink-test.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// MongoDB connection with serverless optimization
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }

  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/coinflip';

  try {
    const db = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });

    cachedDb = db;
    console.log('✅ Connected to MongoDB');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    return null;
  }
}

// Ensure connection
let connectionPromise = null;
function ensureConnection() {
  if (!connectionPromise) {
    connectionPromise = connectToDatabase();
  }
  return connectionPromise;
}

// Middleware to ensure DB connection
app.use(async (req, res, next) => {
  await ensureConnection();
  next();
});

// Mount staking routes
app.use('/api/staking', stakingRoutes);

// Export as Vercel serverless function
export default async (req, res) => {
  await ensureConnection();

  // Rewrite path for Express routing
  req.url = `/api/staking${req.url}`;

  return app(req, res);
};
