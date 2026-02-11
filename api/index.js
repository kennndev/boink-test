// Vercel serverless function entry point
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { userRoutes } from '../server/routes/userRoutes.js';
import { stakingRoutes } from '../server/routes/stakingRoutes.js';

const app = express();

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:8080',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
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
    // For serverless, use connection pooling
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
    // Don't throw, allow function to continue (might reconnect on next call)
    return null;
  }
}

// Initialize database connection on first request
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

// Routes
app.use('/api/users', userRoutes);
app.use('/api/staking', stakingRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  await ensureConnection();
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    dbConnected: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString()
  });
});

// Export as Vercel serverless function
export default app;
