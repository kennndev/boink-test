// Vercel serverless function (cron) to check and resolve pending bets
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load ABI - try multiple paths for different environments
let coinFlipABI;
try {
  const paths = [
    join(process.cwd(), 'src', 'coinFlip.json'),
    join(process.cwd(), 'coinFlip-main', 'src', 'coinFlip.json'),
    join(__dirname, '..', '..', 'src', 'coinFlip.json'),
  ];
  
  let abiContent = null;
  for (const path of paths) {
    try {
      abiContent = readFileSync(path, 'utf-8');
      break;
    } catch (e) {
      // Try next path
    }
  }
  
  if (abiContent) {
    coinFlipABI = JSON.parse(abiContent);
  } else {
    throw new Error('ABI file not found');
  }
} catch (error) {
  console.error('Error loading ABI:', error);
  coinFlipABI = [
    "event BetPlaced(uint256 indexed betId, address indexed player, uint8 guess, uint256 amount, uint256 clientSeed)",
    "function resolveBet(uint256 betId, bytes32 random, bytes signature) external",
    "function bets(uint256) view returns (address player, uint256 amount, uint8 status, uint64 placedAtBlock)",
    "function oracleSigner() view returns (address)"
  ];
}

async function resolveBet(betId, contract, wallet, provider, SERVER_SEED) {
  try {
    const betIdBigInt = BigInt(betId);
    const betInfo = await contract.bets(betIdBigInt);

    if (Number(betInfo.status) !== 1) {
      return { resolved: false, reason: 'Not pending' };
    }

    // Get BetPlaced event
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(Number(betInfo.placedAtBlock) - 100, 0);
    
    const filter = contract.filters.BetPlaced(betIdBigInt);
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);
    
    if (events.length === 0) {
      return { resolved: false, reason: 'Event not found' };
    }

    const event = events[0];
    const parsed = contract.interface.parseLog(event);
    const [, , , , clientSeed] = parsed.args;

    // Generate random
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const random = ethers.keccak256(
      abiCoder.encode(
        ["bytes32", "uint256", "uint256"],
        [SERVER_SEED, clientSeed, betIdBigInt]
      )
    );

    // Create message hash
    const msgHash = ethers.keccak256(
      abiCoder.encode(
        ["uint256", "bytes32"],
        [betIdBigInt, random]
      )
    );

    // Sign
    const signature = await wallet.signMessage(ethers.getBytes(msgHash));

    // Resolve
    const tx = await contract.resolveBet(betIdBigInt, random, signature, {
      gasLimit: 300000
    });

    const receipt = await tx.wait();

    return {
      resolved: receipt.status === 1,
      betId: betId,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber
    };
  } catch (error) {
    console.error(`Error resolving bet ${betId}:`, error);
    return { resolved: false, error: error.message };
  }
}

// Vercel serverless function handler (cron)
export default async function handler(req, res) {
  // Verify cron secret (optional but recommended)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    const RPC_URL = process.env.RPC_URL;
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const CONTRACT_ADDRESS = process.env.COINFLIP_ADDRESS;
    const SERVER_SEED = process.env.SERVER_SEED;
    const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || 763373);

    const missingVars = [];
    if (!RPC_URL) missingVars.push('RPC_URL');
    if (!PRIVATE_KEY) missingVars.push('PRIVATE_KEY');
    if (!CONTRACT_ADDRESS) missingVars.push('COINFLIP_ADDRESS');
    if (!SERVER_SEED) missingVars.push('SERVER_SEED');
    
    if (missingVars.length > 0) {
      return res.status(500).json({ 
        error: 'Missing required environment variables',
        missing: missingVars,
        required: ['RPC_URL', 'PRIVATE_KEY', 'COINFLIP_ADDRESS', 'SERVER_SEED'],
        message: `Please set the following environment variables in Vercel: ${missingVars.join(', ')}`
      });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, coinFlipABI, wallet);

    // Helper function to query events in chunks (respects RPC limits)
    async function queryEventsInChunks(contract, filter, fromBlock, toBlock, maxBlockRange = 10) {
      const allEvents = [];
      let currentFrom = fromBlock;
      
      while (currentFrom <= toBlock) {
        const currentTo = Math.min(currentFrom + maxBlockRange - 1, toBlock);
        try {
          const chunkEvents = await contract.queryFilter(filter, currentFrom, currentTo);
          allEvents.push(...chunkEvents);
        } catch (error) {
          console.warn(`Error querying blocks ${currentFrom}-${currentTo}:`, error.message);
          // Continue with next chunk
        }
        currentFrom = currentTo + 1;
        
        // Small delay to avoid rate limiting
        if (currentFrom <= toBlock) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return allEvents;
    }

    // Get current block
    const currentBlock = await provider.getBlockNumber();
    // Limit to last 50 blocks to avoid RPC limits
    const maxBlocksToCheck = 50;
    const fromBlock = Math.max(0, currentBlock - maxBlocksToCheck);

    // Find pending bets (query in chunks of 10 blocks)
    const filter = contract.filters.BetPlaced();
    const events = await queryEventsInChunks(contract, filter, fromBlock, currentBlock, 10);

    const pendingBets = [];
    for (const event of events) {
      const parsed = contract.interface.parseLog(event);
      const betId = parsed.args[0].toString();
      
      try {
        const betInfo = await contract.bets(betId);
        if (Number(betInfo.status) === 1) { // PENDING
          pendingBets.push(betId);
        }
      } catch (error) {
        console.error(`Error checking bet ${betId}:`, error);
      }
    }

    // Resolve up to 5 bets per execution (to avoid timeout)
    const betsToResolve = pendingBets.slice(0, 5);
    const results = [];

    for (const betId of betsToResolve) {
      const result = await resolveBet(betId, contract, wallet, provider, SERVER_SEED);
      results.push(result);
      
      // Small delay between resolutions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return res.status(200).json({
      success: true,
      checked: events.length,
      pending: pendingBets.length,
      resolved: results.filter(r => r.resolved).length,
      results: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking pending bets:', error);
    return res.status(500).json({ 
      error: 'Failed to check pending bets',
      message: error.message
    });
  }
}


