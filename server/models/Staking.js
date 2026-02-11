import mongoose from 'mongoose';

/**
 * Tracks individual NFT staking sessions
 * Each time a user stakes an NFT, we record:
 * - tokenId
 * - stakedAt timestamp
 * - lastClaimAt timestamp (for calculating pending points)
 */
const stakingSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  tokenId: {
    type: String,
    required: true,
    index: true
  },
  stakedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  lastClaimAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  unstakedAt: {
    type: Date,
    default: null
  }
});

// Compound index for efficient queries
stakingSchema.index({ walletAddress: 1, tokenId: 1, isActive: 1 });
stakingSchema.index({ walletAddress: 1, isActive: 1 });

export const Staking = mongoose.model('Staking', stakingSchema);
