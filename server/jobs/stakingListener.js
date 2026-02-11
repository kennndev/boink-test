import { ethers } from 'ethers';
import { Staking } from '../models/Staking.js';

const STAKING_ABI = [
  "event Staked(address indexed user, uint256[] tokenIds)",
  "event Unstaked(address indexed user, uint256[] tokenIds)"
];

const STAKING_CONTRACT_ADDRESS = process.env.VITE_STAKING_CONTRACT_ADDRESS || "";
const RPC_URL = process.env.VITE_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com";
const POLL_INTERVAL_MS = Number(process.env.STAKING_LISTENER_POLL_MS || 5000);
const MAX_BLOCK_RANGE = Number(process.env.STAKING_LISTENER_MAX_BLOCK_RANGE || 1000);
const START_BLOCK_ENV = process.env.STAKING_LISTENER_START_BLOCK;

function getStakingContract() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);
  return { contract, provider };
}

async function handleStaked(user, tokenIds) {
  const walletAddress = user.toLowerCase().trim();
  for (const tokenId of tokenIds) {
    const tokenIdStr = tokenId.toString();
    const existing = await Staking.findOne({
      walletAddress,
      tokenId: tokenIdStr,
      isActive: true
    });

    if (existing) {
      continue;
    }

    await Staking.create({
      walletAddress,
      tokenId: tokenIdStr,
      stakedAt: new Date(),
      lastClaimAt: new Date(),
      isActive: true
    });
  }
}

async function handleUnstaked(user, tokenIds) {
  const walletAddress = user.toLowerCase().trim();
  for (const tokenId of tokenIds) {
    const tokenIdStr = tokenId.toString();
    const stakeRecord = await Staking.findOne({
      walletAddress,
      tokenId: tokenIdStr,
      isActive: true
    });

    if (!stakeRecord) {
      continue;
    }

    stakeRecord.isActive = false;
    stakeRecord.unstakedAt = new Date();
    await stakeRecord.save();
  }
}

export async function startStakingListener() {
  if (!RPC_URL || !STAKING_CONTRACT_ADDRESS) {
    console.warn('[Staking Listener] Missing RPC_URL or contract address. Listener disabled.');
    return;
  }

  const { contract, provider } = getStakingContract();
  const processedEventIds = new Set();

  let lastProcessedBlock;
  if (START_BLOCK_ENV) {
    lastProcessedBlock = Number(START_BLOCK_ENV);
  } else {
    lastProcessedBlock = await provider.getBlockNumber();
  }

  console.log(`[Staking Listener] Listening for Staked/Unstaked events from block ${lastProcessedBlock}`);

  async function poll() {
    try {
      const currentBlock = await provider.getBlockNumber();

      if (currentBlock < lastProcessedBlock) {
        console.warn(`[Staking Listener] Chain reorg detected. Resetting to current block ${currentBlock}.`);
        lastProcessedBlock = currentBlock;
        return;
      }

      if (currentBlock <= lastProcessedBlock) {
        return;
      }

      const fromBlock = lastProcessedBlock + 1;
      const toBlock = Math.min(currentBlock, lastProcessedBlock + MAX_BLOCK_RANGE);

      const stakedFilter = contract.filters.Staked();
      const unstakedFilter = contract.filters.Unstaked();

      const [stakedEvents, unstakedEvents] = await Promise.all([
        contract.queryFilter(stakedFilter, fromBlock, toBlock),
        contract.queryFilter(unstakedFilter, fromBlock, toBlock)
      ]);

      for (const event of stakedEvents) {
        const eventId = `${event.transactionHash}:${event.logIndex}`;
        if (processedEventIds.has(eventId)) {
          continue;
        }
        processedEventIds.add(eventId);
        const [user, tokenIds] = event.args;
        await handleStaked(user, tokenIds);
      }

      for (const event of unstakedEvents) {
        const eventId = `${event.transactionHash}:${event.logIndex}`;
        if (processedEventIds.has(eventId)) {
          continue;
        }
        processedEventIds.add(eventId);
        const [user, tokenIds] = event.args;
        await handleUnstaked(user, tokenIds);
      }

      lastProcessedBlock = toBlock;
    } catch (error) {
      console.error('[Staking Listener] Error while polling:', error);
    }
  }

  const interval = setInterval(poll, POLL_INTERVAL_MS);
  poll();

  process.on('SIGINT', () => {
    console.log('[Staking Listener] Shutting down...');
    clearInterval(interval);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[Staking Listener] Shutting down...');
    clearInterval(interval);
    process.exit(0);
  });
}
