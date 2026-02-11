// Vercel serverless function to resolve a specific bet
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
  // Fallback to minimal ABI
  coinFlipABI = [
    "event BetPlaced(uint256 indexed betId, address indexed player, uint8 guess, uint256 amount, uint256 clientSeed)",
    "function resolveBet(uint256 betId, bytes32 random, bytes signature) external",
    "function bets(uint256) view returns (address player, uint256 amount, uint8 status, uint64 placedAtBlock)",
    "function oracleSigner() view returns (address)"
  ];
}

// Vercel serverless function handler
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { betId } = req.body;

    if (!betId) {
      return res.status(400).json({ error: 'betId is required' });
    }

    // Environment variables
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

    // Verify oracle signer
    const onchainOracle = await contract.oracleSigner();
    if (onchainOracle.toLowerCase() !== wallet.address.toLowerCase()) {
      return res.status(500).json({ 
        error: 'Oracle signer mismatch',
        message: 'The PRIVATE_KEY in Vercel environment variables does not match the oracleSigner set in the contract.',
        onchainOracle: onchainOracle,
        walletAddress: wallet.address,
        solution: 'Either update PRIVATE_KEY in Vercel to match the contract\'s oracleSigner, or update the contract\'s oracleSigner to match your PRIVATE_KEY (requires contract owner)'
      });
    }

    // Get bet info
    const betIdBigInt = BigInt(betId);
    const betInfo = await contract.bets(betIdBigInt);
    const status = Number(betInfo.status);
    
    // BetStatus: 0 = NONE, 1 = PENDING, 2 = SETTLED, 3 = REFUNDED
    // Check if bet is pending
    if (status !== 1) {
      // If already settled, return success (bet was already resolved)
      if (status === 2) {
        return res.status(200).json({ 
          success: true,
          message: 'Bet was already resolved',
          betId: betId,
          status: status,
          alreadyResolved: true
        });
      }
      
      return res.status(400).json({ 
        error: 'Bet is not pending',
        status: status,
        statusText: status === 0 ? 'NONE' : status === 2 ? 'SETTLED' : status === 3 ? 'REFUNDED' : 'UNKNOWN',
        betId: betId,
        message: `Bet status is ${status} (${status === 0 ? 'NONE' : status === 2 ? 'SETTLED' : status === 3 ? 'REFUNDED' : 'UNKNOWN'}), expected 1 (PENDING)`
      });
    }

    // Get BetPlaced event to get clientSeed
    // Use the exact block where bet was placed (respects 10-block RPC limit)
    const placedBlock = Number(betInfo.placedAtBlock);
    const currentBlock = await provider.getBlockNumber();
    
    // Ensure range is exactly 10 blocks or less (RPC free tier limit)
    // Range is inclusive, so 10 blocks = fromBlock to fromBlock + 9
    const maxRange = 10;
    const fromBlock = Math.max(placedBlock - 4, 0);
    let toBlock = Math.min(placedBlock + 5, currentBlock);
    
    // Calculate actual range (inclusive: toBlock - fromBlock + 1)
    let blockRange = toBlock - fromBlock + 1;
    
    // If range exceeds 10, adjust to exactly 10 blocks
    if (blockRange > maxRange) {
      toBlock = fromBlock + maxRange - 1; // -1 because range is inclusive
      blockRange = maxRange;
      console.log(`Adjusted block range to exactly ${blockRange} blocks: [${fromBlock}, ${toBlock}]`);
    }
    
    const filter = contract.filters.BetPlaced(betIdBigInt);
    let events = [];
    try {
      console.log(`Querying BetPlaced event for betId ${betId} in blocks [${fromBlock}, ${toBlock}] (range: ${blockRange})`);
      events = await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (queryError) {
      // If query fails, try even smaller range
      console.warn('Event query failed, trying exact block:', queryError.message);
      try {
        // Try querying just the placed block (range = 1)
        events = await contract.queryFilter(filter, placedBlock, placedBlock);
        console.log('Successfully queried single block');
      } catch (e) {
        console.error('Event query failed even for single block:', e.message);
        throw new Error(`Failed to query BetPlaced event: ${e.message}`);
      }
    }
    
    if (events.length === 0) {
      return res.status(404).json({ error: 'BetPlaced event not found' });
    }

    const event = events[0];
    const parsed = contract.interface.parseLog(event);
    const [, , , , clientSeed] = parsed.args;

    // Generate random value
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

    // Resolve bet
    const tx = await contract.resolveBet(betIdBigInt, random, signature, {
      gasLimit: 300000
    });

    const receipt = await tx.wait();

    if (receipt.status === 0) {
      return res.status(500).json({ error: 'Transaction reverted' });
    }

    return res.status(200).json({
      success: true,
      betId: betId,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      message: 'Bet resolved successfully'
    });

  } catch (error) {
    console.error('Error resolving bet:', error);
    return res.status(500).json({ 
      error: 'Failed to resolve bet',
      message: error.message
    });
  }
}

