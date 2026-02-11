// Vercel serverless function for all /api/staking/* routes
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import { User } from '../../server/models/User.js';
import { Staking } from '../../server/models/Staking.js';
import { getPendingPoints, distributeStakingPoints } from '../../server/jobs/dailyPointsDistribution.js';

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

// CORS headers
const setCORS = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

// NFT Staking Contract ABI
const STAKING_ABI = [
  "function stakedTokensOf(address user) external view returns (uint256[])",
  "function stakedCount(address user) external view returns (uint256)"
];

const STAKING_CONTRACT_ADDRESS = process.env.VITE_STAKING_CONTRACT_ADDRESS || "0xBE1F446338737E3A9d60fD0a71cf9C53f329E7dd";
const RPC_URL = process.env.VITE_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com";

function getStakingContract() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);
  return { contract, provider };
}

// Main handler
export default async (req, res) => {
  setCORS(res);

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Connect to database
  await connectToDatabase();

  // Parse path - remove /api/staking prefix
  const fullPath = req.url.split('?')[0];
  const path = fullPath.replace('/api/staking', '') || '/';
  const pathParts = path.split('/').filter(Boolean);

  // Route: POST /distribute-points
  if (req.method === 'POST' && (pathParts[0] === 'distribute-points' || path === '/distribute-points')) {
    try {
      const result = await distributeStakingPoints();
      return res.status(200).json({
        success: result.success,
        message: result.success
          ? `Distributed ${result.totalPointsDistributed} points to ${result.processed} wallets`
          : 'Distribution failed',
        data: result
      });
    } catch (error) {
      console.error('Error distributing points:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to distribute points',
        error: error.message
      });
    }
  }

  // Route: GET /info/:walletAddress
  if (req.method === 'GET' && pathParts[0] === 'info' && pathParts[1]) {
    try {
      const walletAddress = pathParts[1];
      const normalizedAddress = walletAddress.toLowerCase().trim();

      const { pendingPoints, stakedCount, nextDistribution } = await getPendingPoints(normalizedAddress);

      const user = await User.findOne({ walletAddress: normalizedAddress });
      const totalPoints = user ? user.points : 0;

      return res.status(200).json({
        success: true,
        data: {
          walletAddress: normalizedAddress,
          stakedCount,
          pendingPoints,
          totalPoints,
          totalWithPending: totalPoints + pendingPoints,
          pointsPerDay: stakedCount * 100,
          nextDistribution
        }
      });
    } catch (error) {
      console.error('Error getting staking info:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get staking info',
        error: error.message
      });
    }
  }

  // Route: POST /sync/:walletAddress
  if (req.method === 'POST' && pathParts[0] === 'sync' && pathParts[1]) {
    try {
      const walletAddress = pathParts[1];
      const normalizedAddress = walletAddress.toLowerCase().trim();

      const { contract } = getStakingContract();
      let stakedTokenIds = [];

      try {
        const tokenIds = await contract.stakedTokensOf(normalizedAddress);
        stakedTokenIds = tokenIds.map(id => id.toString());
      } catch (error) {
        console.error('Error fetching staked tokens:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch staking data from blockchain',
          error: error.message
        });
      }

      const dbStakedNFTs = await Staking.find({
        walletAddress: normalizedAddress,
        isActive: true
      });

      const dbStakedTokenIds = new Set(dbStakedNFTs.map(s => s.tokenId));
      const onChainStakedTokenIds = new Set(stakedTokenIds);

      const newlyStaked = stakedTokenIds.filter(id => !dbStakedTokenIds.has(id));
      const unstaked = Array.from(dbStakedTokenIds).filter(id => !onChainStakedTokenIds.has(id));

      // Add newly staked NFTs
      for (const tokenId of newlyStaked) {
        await Staking.create({
          walletAddress: normalizedAddress,
          tokenId,
          stakedAt: new Date(),
          lastClaimAt: new Date(),
          isActive: true
        });
      }

      // Mark unstaked NFTs as inactive and award points
      let unstakedPoints = 0;
      for (const tokenId of unstaked) {
        const stakeRecord = await Staking.findOne({
          walletAddress: normalizedAddress,
          tokenId,
          isActive: true
        });

        if (stakeRecord) {
          const now = Date.now();
          const timeElapsedMs = now - stakeRecord.lastClaimAt.getTime();
          const timeElapsedDays = timeElapsedMs / (1000 * 60 * 60 * 24);
          const pendingPoints = Math.floor(timeElapsedDays * 100);

          if (pendingPoints > 0) {
            unstakedPoints += pendingPoints;
          }

          stakeRecord.isActive = false;
          stakeRecord.unstakedAt = new Date();
          await stakeRecord.save();
        }
      }

      if (unstakedPoints > 0) {
        let user = await User.findOne({ walletAddress: normalizedAddress });
        if (!user) {
          user = new User({ walletAddress: normalizedAddress, points: 0 });
        }
        user.points += unstakedPoints;
        await user.save();
      }

      const { pendingPoints, stakedCount, nextDistribution } = await getPendingPoints(normalizedAddress);

      return res.status(200).json({
        success: true,
        message: 'Staking state synced',
        data: {
          stakedCount,
          newlyStaked: newlyStaked.length,
          unstaked: unstaked.length,
          unstakedPointsAwarded: unstakedPoints,
          pendingPoints,
          nextDistribution
        }
      });
    } catch (error) {
      console.error('Error syncing staking:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to sync staking state',
        error: error.message
      });
    }
  }

  // Route not found
  return res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.url
  });
};
