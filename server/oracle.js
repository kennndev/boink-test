// oracle.js
require('dotenv').config();
const { ethers } = require('ethers');

// --------- ENV ---------
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.COINFLIP_ADDRESS;
const SERVER_SEED = process.env.SERVER_SEED; // 32-byte hex string (0x...)
const CHAIN_ID = Number(process.env.CHAIN_ID || 1);

// Basic checks
if (!RPC_URL || !PRIVATE_KEY || !CONTRACT_ADDRESS || !SERVER_SEED) {
  throw new Error("Missing env: RPC_URL / PRIVATE_KEY / CONTRACT_ADDRESS / SERVER_SEED");
}

// --------- ABI ---------
const ABI = [
  // event BetPlaced(uint256 indexed betId, address indexed player, Side guess, uint256 amount, uint256 clientSeed);
  "event BetPlaced(uint256 indexed betId, address indexed player, uint8 guess, uint256 amount, uint256 clientSeed)",

  // function resolveBet(uint256 betId, bytes32 random, bytes signature) external;
  "function resolveBet(uint256 betId, bytes32 random, bytes signature) external",

  // optional checks
  "function oracleSigner() view returns (address)",
  "function resolveTimeoutBlocks() view returns (uint256)",
  
  // bet status check
  "function bets(uint256) view returns (address player, uint256 amount, uint8 status, uint64 placedAtBlock)"
];

// --------- MAIN LOGIC ---------
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Oracle wallet:", wallet.address);
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("RPC:", RPC_URL);

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  // Sanity check: is this wallet actually the oracleSigner in the contract?
  const onchainOracle = await contract.oracleSigner();
  if (onchainOracle.toLowerCase() !== wallet.address.toLowerCase()) {
    console.warn("[WARN] on-chain oracleSigner != wallet.address");
    console.warn("       onchain:", onchainOracle);
    console.warn("       wallet :", wallet.address);
    console.warn("       Fix with setOracleSigner() before trusting this oracle.");
  }

  const timeoutBlocks = await contract.resolveTimeoutBlocks();
  console.log("resolveTimeoutBlocks:", timeoutBlocks.toString());

  // Polling-based event listener (works with RPC providers that don't support filters)
  let lastProcessedBlock = await provider.getBlockNumber();
  const processedBetIds = new Set(); // Track processed bets to avoid duplicates

  console.log("Oracle is listening for BetPlaced events (polling mode)...");
  console.log("Starting from block:", lastProcessedBlock);

  // Poll for new events every 3 seconds
  const POLL_INTERVAL = 3000; // 3 seconds

  async function pollForEvents() {
    try {
      const currentBlock = await provider.getBlockNumber();
      
      // Handle chain reorg or node sync: if current block is behind, reset to current
      if (currentBlock < lastProcessedBlock) {
        console.warn(`[WARN] Chain reorg detected: current block (${currentBlock}) < last processed (${lastProcessedBlock}). Resetting.`);
        lastProcessedBlock = currentBlock;
        return;
      }
      
      // No new blocks to process
      if (currentBlock <= lastProcessedBlock) {
        // Only log every 10th poll to avoid spam
        if (Math.random() < 0.1) {
          console.log(`[DEBUG] No new blocks. Current: ${currentBlock}, Last processed: ${lastProcessedBlock}`);
        }
        return;
      }
      
      // Limit block range to avoid RPC limits (some providers limit query range)
      const MAX_BLOCK_RANGE = 1000;
      const fromBlock = lastProcessedBlock + 1;
      const toBlock = Math.min(currentBlock, lastProcessedBlock + MAX_BLOCK_RANGE);
      
      // Safety check: ensure valid range
      if (fromBlock > toBlock) {
        console.warn(`[WARN] Invalid block range: fromBlock (${fromBlock}) > toBlock (${toBlock}). Skipping.`);
        return;
      }
      
      console.log(`[DEBUG] Querying blocks ${fromBlock} to ${toBlock} (current: ${currentBlock})`);
      
      // Query for BetPlaced events from last processed block to current
      const filter = contract.filters.BetPlaced();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      
      if (events.length > 0) {
        console.log(`[INFO] Found ${events.length} BetPlaced event(s) in blocks ${fromBlock}-${toBlock}`);
      }

      for (const event of events) {
        const [betIdArg, player, guess, amount, clientSeed] = event.args;
        
        // Skip if we've already processed this bet
        if (processedBetIds.has(betIdArg.toString())) {
          continue;
        }
        
        processedBetIds.add(betIdArg.toString());
        
        try {
          console.log("------------------------------------------------");
          console.log("New BetPlaced:");
          console.log(" betId     :", betIdArg.toString());
          console.log(" player    :", player);
          
          // Convert guess to number for proper comparison (handles BigNumber/string)
          const guessValue = Number(guess);
          const guessText = guessValue === 0 ? "Heads" : "Tails";
          console.log(" guess     :", guessText, `(raw value: ${guessValue})`);
          
          console.log(" amount    :", amount.toString());
          console.log(" clientSeed:", clientSeed.toString());
          console.log(" block     :", event.blockNumber);

          // 1) Build randomness from SERVER_SEED + clientSeed + betId
          //    random = keccak256(abi.encode(serverSeed, clientSeed, betId))
          const abiCoder = ethers.AbiCoder.defaultAbiCoder();
          const random = ethers.keccak256(
            abiCoder.encode(
              ["bytes32", "uint256", "uint256"],
              [SERVER_SEED, clientSeed, betIdArg]
            )
          );

          console.log(" random:", random);
          
          // Calculate what the outcome will be (same logic as contract)
          // outcome = first bit of random[0]
          const randomBytes = ethers.getBytes(random);
          const outcomeValue = (randomBytes[0] & 1) === 0 ? 0 : 1;
          const outcomeText = outcomeValue === 0 ? "Heads" : "Tails";
          const willWin = outcomeValue === guessValue;
          console.log(`[INFO] Outcome will be: ${outcomeText} (${outcomeValue}), Player guess: ${guessText} (${guessValue}), Will win: ${willWin}`);

          // 2) Build the message hash exactly like in Solidity:
          //    bytes32 msgHash = keccak256(abi.encode(betId, random));
          const msgHash = ethers.keccak256(
            abiCoder.encode(
              ["uint256", "bytes32"],
              [betIdArg, random]
            )
          );

          console.log(" msgHash:", msgHash);

          // 3) Sign using EIP-191 personal_sign:
          //    Solidity side does: ECDSA.toEthSignedMessageHash(msgHash)
          const signature = await wallet.signMessage(ethers.getBytes(msgHash));

          console.log(" signature:", signature);
          
          // Verify the signature matches before sending (debugging)
          const ethSignedMsgHash = ethers.hashMessage(ethers.getBytes(msgHash));
          const recoveredSigner = ethers.recoverAddress(ethSignedMsgHash, signature);
          console.log(" recovered signer:", recoveredSigner);
          console.log(" oracle wallet  :", wallet.address);
          if (recoveredSigner.toLowerCase() !== wallet.address.toLowerCase()) {
            console.error("[ERROR] Signature verification failed! Signer mismatch.");
            throw new Error("Signature does not match oracle wallet");
          }
          console.log(" ✓ Signature verified");
          
          // Check bet status before resolving
          try {
            const betInfo = await contract.bets(betIdArg);
            console.log(" bet status check:");
            console.log("  - Player:", betInfo.player);
            console.log("  - Amount:", betInfo.amount.toString());
            console.log("  - Status:", betInfo.status, "(0=NONE, 1=PENDING, 2=SETTLED, 3=REFUNDED)");
            if (betInfo.status !== 1) {
              console.error(`[ERROR] Bet is not PENDING (status: ${betInfo.status}). Cannot resolve.`);
              throw new Error(`Bet status is ${betInfo.status}, expected 1 (PENDING)`);
            }
            console.log(" ✓ Bet is PENDING, can resolve");
          } catch (betErr) {
            console.error("[ERROR] Failed to check bet status:", betErr.message);
            throw betErr;
          }

          // 4) Call resolveBet on-chain
          const tx = await contract.resolveBet(betIdArg, random, signature, {
            gasLimit: 300000 // adjust if needed
          });

          console.log(" resolveBet tx sent:", tx.hash);
          
          try {
            const receipt = await tx.wait();
            
            if (receipt.status === 0) {
              console.error("[ERROR] Transaction reverted!");
            } else {
              console.log(" resolveBet mined in block:", receipt.blockNumber);
              console.log(" ✓ Bet resolved successfully!");
              
              // Try to find BetResolved event in receipt
              try {
                const resolvedEvents = receipt.logs
                  .map(log => {
                    try {
                      return contract.interface.parseLog(log);
                    } catch (e) {
                      return null;
                    }
                  })
                  .filter(parsed => parsed && parsed.name === "BetResolved");
                
                if (resolvedEvents.length > 0) {
                  const event = resolvedEvents[0];
                  const [betId, player, guess, outcome, won, amount, payout, profit] = event.args;
                  console.log(" BetResolved event:");
                  console.log("  - Won:", won);
                  console.log("  - Outcome:", outcome === 0 ? "Heads" : "Tails");
                  console.log("  - Payout:", payout.toString());
                  console.log("  - Profit:", profit.toString());
                }
              } catch (parseErr) {
                console.log("[INFO] Could not parse BetResolved event (this is okay)");
              }
            }
          } catch (waitErr) {
            // Transaction failed during execution
            console.error("[ERROR] Transaction failed during execution:", waitErr);
            
            // Try to extract revert reason
            if (waitErr.reason) {
              console.error(`[ERROR] Revert reason: ${waitErr.reason}`);
            }
            if (waitErr.data) {
              console.error(`[ERROR] Error data:`, waitErr.data);
            }
            
            // Try to get the revert reason from the transaction
            try {
              const txReceipt = await provider.getTransactionReceipt(tx.hash);
              if (txReceipt && txReceipt.status === 0) {
                console.error("[ERROR] Transaction was reverted on-chain");
              }
            } catch (receiptErr) {
              // Ignore
            }
            
            throw waitErr;
          }
        } catch (err) {
          console.error("[ERROR] while handling BetPlaced:", err);
          
          // Try to extract more details from the error
          if (err.reason) {
            console.error(`[ERROR] Revert reason: ${err.reason}`);
          }
          if (err.data) {
            console.error(`[ERROR] Error data:`, err.data);
          }
          if (err.transaction) {
            console.error(`[ERROR] Failed transaction:`, err.transaction.hash);
          }
          
          // In prod: log this to external logging, maybe retry logic
        }
      }

      // Update last processed block to the block we queried (not necessarily currentBlock)
      lastProcessedBlock = toBlock;
      
      // If we hit the max range limit, we'll continue from where we left off next poll
      if (toBlock < currentBlock) {
        console.log(`[INFO] Processed blocks ${fromBlock}-${toBlock}, ${currentBlock - toBlock} blocks remaining`);
      }
    } catch (err) {
      console.error("[ERROR] while polling for events:", err);
      // Don't update lastProcessedBlock on error to avoid skipping blocks
    }
  }

  // Start polling
  const pollInterval = setInterval(pollForEvents, POLL_INTERVAL);
  
  // Also poll immediately
  pollForEvents();
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\n[INFO] Shutting down oracle...');
    clearInterval(pollInterval);
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[INFO] Shutting down oracle...');
    clearInterval(pollInterval);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error in oracle:", err);
  process.exit(1);
});
