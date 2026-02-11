import { ethers } from 'ethers';
import { User } from '../models/User.js';
import { Staking } from '../models/Staking.js';

const POINTS_PER_NFT_PER_DAY = 100;

// Contract configuration
const STAKING_ABI = [
  "function stakedTokensOf(address user) external view returns (uint256[])",
  "function stakedCount(address user) external view returns (uint256)"
];
const STAKING_CONTRACT_ADDRESS = process.env.VITE_STAKING_CONTRACT_ADDRESS || "";
const RPC_URL = process.env.VITE_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com";
const SYNC_ONCHAIN_BEFORE_DISTRIBUTION = process.env.STAKING_SYNC_BEFORE_DISTRIBUTION === 'true';

function getStakingContract() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);
  return { contract, provider };
}

/**
 * Sync a user's staking state from the blockchain
 */
async function syncUserStaking(walletAddress) {
  const normalizedAddress = walletAddress.toLowerCase().trim();
  const { contract } = getStakingContract();

  try {
    // Get staked NFTs from blockchain
    const tokenIds = await contract.stakedTokensOf(normalizedAddress);
    const stakedTokenIds = tokenIds.map(id => id.toString());

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

    // Add newly staked NFTs
    for (const tokenId of newlyStaked) {
      await Staking.create({
        walletAddress: normalizedAddress,
        tokenId,
        stakedAt: new Date(),
        lastClaimAt: new Date(),
        isActive: true
      });
      console.log(`[Sync] Added staking record for ${normalizedAddress} token ${tokenId}`);
    }

    // Mark unstaked NFTs as inactive
    for (const tokenId of unstaked) {
      const stakeRecord = await Staking.findOne({
        walletAddress: normalizedAddress,
        tokenId,
        isActive: true
      });

      if (stakeRecord) {
        stakeRecord.isActive = false;
        stakeRecord.unstakedAt = new Date();
        await stakeRecord.save();
        console.log(`[Sync] Marked ${normalizedAddress} token ${tokenId} as unstaked`);
      }
    }

    return { synced: true, newlyStaked: newlyStaked.length, unstaked: unstaked.length };
  } catch (error) {
    console.error(`[Sync] Error syncing ${normalizedAddress}:`, error);
    return { synced: false, error: error.message };
  }
}

/**
 * Daily cron job to award points once per day
 * Optional on-chain sync before distributing (see STAKING_SYNC_BEFORE_DISTRIBUTION)
 */
export async function distributeStakingPoints() {
  console.log(`[Daily Points] Starting points distribution at ${new Date().toISOString()}`);

  try {
    // Step 1: Get all unique wallet addresses
    // Check both User collection (anyone who has connected) and Staking records
    const allUsers = await User.find({}).select('walletAddress');
    const allStakingRecords = await Staking.find({});

    const walletSet = new Set();
    allUsers.forEach(u => walletSet.add(u.walletAddress));
    allStakingRecords.forEach(s => walletSet.add(s.walletAddress));

    const uniqueWallets = Array.from(walletSet);

    console.log(`[Daily Points] Found ${uniqueWallets.length} unique wallets to check (${allUsers.length} users, ${new Set(allStakingRecords.map(s => s.walletAddress)).size} with staking history)`);

    // Step 2: Sync each wallet's staking state from blockchain (optional)
    if (SYNC_ONCHAIN_BEFORE_DISTRIBUTION) {
      for (const wallet of uniqueWallets) {
        await syncUserStaking(wallet);
      }
    } else {
      console.log('[Daily Points] Skipping on-chain sync (STAKING_SYNC_BEFORE_DISTRIBUTION=false)');
    }

    // Step 3: Get all currently active staking records (after sync)
    const activeStakes = await Staking.find({ isActive: true });

    console.log(`[Daily Points] Found ${activeStakes.length} active staking records`);

    if (activeStakes.length === 0) {
      console.log('[Daily Points] No active stakes found');
      return {
        success: true,
        processed: 0,
        totalPointsDistributed: 0
      };
    }

    // Group by wallet address to batch updates
    const walletStakes = new Map();

    for (const stake of activeStakes) {
      const wallet = stake.walletAddress;
      if (!walletStakes.has(wallet)) {
        walletStakes.set(wallet, []);
      }
      walletStakes.get(wallet).push(stake);
    }

    let totalPointsDistributed = 0;
    let walletsProcessed = 0;

    // Process each wallet
    for (const [walletAddress, stakes] of walletStakes.entries()) {
      try {
        const now = Date.now();
        let walletPoints = 0;

        // Calculate points for each staked NFT
        for (const stake of stakes) {
          const lastClaimTime = stake.lastClaimAt.getTime();
          const timeElapsedMs = now - lastClaimTime;
          const timeElapsedDays = timeElapsedMs / (1000 * 60 * 60 * 24);

          if (timeElapsedDays >= 1) {
            const points = Math.floor(timeElapsedDays * POINTS_PER_NFT_PER_DAY);
            walletPoints += points;

            // Update lastClaimAt to now
            stake.lastClaimAt = new Date();
            await stake.save();
          }
        }

        // Award points to user if any were earned
        if (walletPoints > 0) {
          let user = await User.findOne({ walletAddress });

          if (!user) {
            user = new User({
              walletAddress,
              points: 0
            });
          }

          user.points += walletPoints;
          await user.save();

          console.log(`[Daily Points] Awarded ${walletPoints} points to ${walletAddress} (${stakes.length} NFTs staked)`);

          totalPointsDistributed += walletPoints;
          walletsProcessed++;
        }
      } catch (error) {
        console.error(`[Daily Points] Error processing wallet ${walletAddress}:`, error);
        // Continue with other wallets
      }
    }

    console.log(`[Daily Points] Completed: ${walletsProcessed} wallets processed, ${totalPointsDistributed} total points distributed`);

    return {
      success: true,
      processed: walletsProcessed,
      totalPointsDistributed,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[Daily Points] Error in daily distribution:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get pending points for a wallet (for display purposes only)
 * Points are not claimed, just calculated
 */
export async function getPendingPoints(walletAddress) {
  const normalizedAddress = walletAddress.toLowerCase().trim();

  const activeStakes = await Staking.find({
    walletAddress: normalizedAddress,
    isActive: true
  });

  if (activeStakes.length === 0) {
    return {
      pendingPoints: 0,
      stakedCount: 0,
      nextDistribution: getNextDistributionTime()
    };
  }

  const now = Date.now();
  let totalPendingPoints = 0;

  for (const stake of activeStakes) {
    const lastClaimTime = stake.lastClaimAt.getTime();
    const timeElapsedMs = now - lastClaimTime;
    const timeElapsedDays = timeElapsedMs / (1000 * 60 * 60 * 24);
    const points = timeElapsedDays * POINTS_PER_NFT_PER_DAY;
    totalPendingPoints += points;
  }

  return {
    pendingPoints: Math.floor(totalPendingPoints),
    stakedCount: activeStakes.length,
    nextDistribution: getNextDistributionTime()
  };
}

/**
 * Calculate when the next daily distribution will occur
 */
function getNextDistributionTime() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);

  return {
    timestamp: next.toISOString(),
    hoursRemaining: Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60))
  };
}
