import express from 'express';
import { ethers } from 'ethers';
import { User } from '../models/User.js';
import { Staking } from '../models/Staking.js';
import { getPendingPoints, distributeStakingPoints } from '../jobs/dailyPointsDistribution.js';

const router = express.Router();

// NFT Staking Contract ABI (minimal)
const STAKING_ABI = [
  "function stakedTokensOf(address user) external view returns (uint256[])",
  "function stakedCount(address user) external view returns (uint256)"
];

const STAKING_CONTRACT_ADDRESS = process.env.VITE_STAKING_CONTRACT_ADDRESS || "0xBE1F446338737E3A9d60fD0a71cf9C53f329E7dd";
const RPC_URL = process.env.VITE_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com";
const POINTS_PER_NFT_PER_DAY = 100;

/**
 * Get staking contract instance
 */
function getStakingContract() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);
  return { contract, provider };
}

/**
 * Sync staking state from blockchain
 * This checks which NFTs are currently staked on-chain and updates the database
 */
router.post('/sync/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = walletAddress.toLowerCase().trim();

    console.log(`[Staking Sync] Syncing for wallet: ${normalizedAddress}`);

    // Get staked NFTs from blockchain
    const { contract } = getStakingContract();
    let stakedTokenIds = [];

    try {
      const tokenIds = await contract.stakedTokensOf(normalizedAddress);
      stakedTokenIds = tokenIds.map(id => id.toString());
      console.log(`[Staking Sync] Found ${stakedTokenIds.length} staked NFTs on-chain`);
    } catch (error) {
      console.error('[Staking Sync] Error fetching staked tokens:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch staking data from blockchain',
        error: error.message
      });
    }

    // Get current database state
    const dbStakedNFTs = await Staking.find({
      walletAddress: normalizedAddress,
      isActive: true
    });

    const dbStakedTokenIds = new Set(dbStakedNFTs.map(s => s.tokenId));
    const onChainStakedTokenIds = new Set(stakedTokenIds);

    // Find newly staked NFTs (on-chain but not in DB)
    const newlyStaked = stakedTokenIds.filter(id => !dbStakedTokenIds.has(id));

    // Find unstaked NFTs (in DB but not on-chain)
    const unstaked = Array.from(dbStakedTokenIds).filter(id => !onChainStakedTokenIds.has(id));

    console.log(`[Staking Sync] Newly staked: ${newlyStaked.length}, Unstaked: ${unstaked.length}`);

    // Add newly staked NFTs to DB
    for (const tokenId of newlyStaked) {
      await Staking.create({
        walletAddress: normalizedAddress,
        tokenId,
        stakedAt: new Date(),
        lastClaimAt: new Date(),
        isActive: true
      });
      console.log(`[Staking Sync] Added staking record for token ${tokenId}`);
    }

    // Mark unstaked NFTs as inactive and award any pending points
    let unstakedPoints = 0;
    for (const tokenId of unstaked) {
      const stakeRecord = await Staking.findOne({
        walletAddress: normalizedAddress,
        tokenId,
        isActive: true
      });

      if (stakeRecord) {
        // Calculate and award pending points for this NFT before marking as unstaked
        const now = Date.now();
        const timeElapsedMs = now - stakeRecord.lastClaimAt.getTime();
        const timeElapsedDays = timeElapsedMs / (1000 * 60 * 60 * 24);
        const pendingPoints = Math.floor(timeElapsedDays * POINTS_PER_NFT_PER_DAY);

        if (pendingPoints > 0) {
          unstakedPoints += pendingPoints;
        }

        // Mark as unstaked
        stakeRecord.isActive = false;
        stakeRecord.unstakedAt = new Date();
        await stakeRecord.save();
        console.log(`[Staking Sync] Marked token ${tokenId} as unstaked (${pendingPoints} points earned)`);
      }
    }

    // Award all unstaked points at once
    if (unstakedPoints > 0) {
      let user = await User.findOne({ walletAddress: normalizedAddress });
      if (!user) {
        user = new User({ walletAddress: normalizedAddress, points: 0 });
      }
      user.points += unstakedPoints;
      await user.save();
      console.log(`[Staking Sync] Awarded ${unstakedPoints} total points for unstaked NFTs`);
    }

    // Calculate current pending points
    const { pendingPoints, stakedCount, nextDistribution } = await getPendingPoints(normalizedAddress);

    res.json({
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
    console.error('[Staking Sync] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync staking state',
      error: error.message
    });
  }
});

/**
 * Get staking info for a wallet (without syncing from blockchain)
 * Shows pending points that will be automatically awarded during next daily distribution
 */
router.get('/info/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = walletAddress.toLowerCase().trim();

    const { pendingPoints, stakedCount, nextDistribution } = await getPendingPoints(normalizedAddress);

    // Get user's total points
    const user = await User.findOne({ walletAddress: normalizedAddress });
    const totalPoints = user ? user.points : 0;

    res.json({
      success: true,
      data: {
        walletAddress: normalizedAddress,
        stakedCount,
        pendingPoints,
        totalPoints,
        totalWithPending: totalPoints + pendingPoints,
        pointsPerDay: stakedCount * POINTS_PER_NFT_PER_DAY,
        nextDistribution
      }
    });
  } catch (error) {
    console.error('[Staking Info] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get staking info',
      error: error.message
    });
  }
});

/**
 * Manually trigger daily points distribution (admin endpoint for testing)
 */
router.post('/distribute-points', async (req, res) => {
  try {
    console.log('[Staking] Manual points distribution triggered');

    const result = await distributeStakingPoints();

    res.json({
      success: result.success,
      message: result.success
        ? `Distributed ${result.totalPointsDistributed} points to ${result.processed} wallets`
        : 'Distribution failed',
      data: result
    });
  } catch (error) {
    console.error('[Staking] Error in manual distribution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to distribute points',
      error: error.message
    });
  }
});

/**
 * Get staking history for a wallet
 */
router.get('/history/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = walletAddress.toLowerCase().trim();
    const limit = parseInt(req.query.limit) || 50;

    const stakingHistory = await Staking.find({
      walletAddress: normalizedAddress
    })
      .sort({ stakedAt: -1 })
      .limit(limit)
      .select('tokenId stakedAt lastClaimAt isActive unstakedAt -_id');

    res.json({
      success: true,
      data: {
        walletAddress: normalizedAddress,
        history: stakingHistory
      }
    });
  } catch (error) {
    console.error('[Staking History] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get staking history',
      error: error.message
    });
  }
});

export { router as stakingRoutes };
