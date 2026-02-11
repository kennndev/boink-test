// Use relative URL if VITE_API_BASE_URL is not set (same domain deployment)
// Otherwise use the configured URL (for separate deployments)
// In development, default to localhost:3001 if not specified
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

// Bet resolver service URL (Heroku deployment for fast bet resolution)
const BET_RESOLVER_URL = import.meta.env.VITE_BET_RESOLVER_URL || 
  'https://cardify-club-f121a6960ade.herokuapp.com';

export interface UserData {
  walletAddress: string;
  points: number;
  flips: number;
  twitterFollowed: boolean;
  referralUsed: boolean;
  twitterUserId?: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

/**
 * Get user data by wallet address
 */
export async function getUser(walletAddress: string): Promise<UserData | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${walletAddress}`);
    const data = await response.json();
    
    if (data.success && data.user) {
      return data.user;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

/**
 * Award points for coin flip
 */
export async function awardFlipPoints(walletAddress: string): Promise<{ success: boolean; points?: number; pointsAwarded?: number; message?: string; isFirstFlip?: boolean }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${walletAddress}/flip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    return {
      success: data.success,
      points: data.points,
      pointsAwarded: data.pointsAwarded,
      message: data.message,
      isFirstFlip: data.isFirstFlip
    };
  } catch (error) {
    console.error('Error awarding flip points:', error);
    return {
      success: false,
      message: 'Failed to award points'
    };
  }
}

/**
 * Get Twitter OAuth URL for verification
 */
export async function getTwitterOAuthUrl(walletAddress: string): Promise<{ success: boolean; oauthUrl?: string; requiresOAuth?: boolean; trustBased?: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${walletAddress}/twitter-oauth`);
    
    if (!response.ok) {
      // Try to parse error response
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: `Server error: ${response.status} ${response.statusText}` };
      }
      
      console.error('Twitter OAuth API error:', response.status, errorData);
      
      // If Twitter API is not configured, return trust-based response
      if (response.status === 500 && errorData.message?.includes('not configured')) {
        return {
          success: false,
          trustBased: true,
          message: 'Twitter API not configured. Using trust-based system.'
        };
      }
      
      return {
        success: false,
        message: errorData.message || `Failed to get OAuth URL: ${response.status}`,
        error: errorData.error
      };
    }
    
    const data = await response.json();
    return {
      success: data.success,
      oauthUrl: data.oauthUrl,
      requiresOAuth: data.requiresOAuth,
      trustBased: data.trustBased,
      message: data.message
    };
  } catch (error) {
    console.error('Error getting Twitter OAuth URL:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get OAuth URL'
    };
  }
}

/**
 * Award points for Twitter follow (trust-based fallback)
 */
export async function awardTwitterFollowPoints(walletAddress: string): Promise<{ success: boolean; points?: number; pointsAwarded?: number; message?: string; requiresOAuth?: boolean }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${walletAddress}/twitter-follow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    return {
      success: data.success,
      points: data.points,
      pointsAwarded: data.pointsAwarded,
      message: data.message,
      requiresOAuth: data.requiresOAuth
    };
  } catch (error) {
    console.error('Error awarding Twitter follow points:', error);
    return {
      success: false,
      message: 'Failed to award points'
    };
  }
}

/**
 * Award points for referral
 */
export async function awardReferralPoints(walletAddress: string, referrerAddress: string): Promise<{ success: boolean; points?: number; pointsAwarded?: number; message?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${walletAddress}/referral`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ referrerAddress }),
    });
    
    const data = await response.json();
    return {
      success: data.success,
      points: data.points,
      pointsAwarded: data.pointsAwarded,
      message: data.message
    };
  } catch (error) {
    console.error('Error awarding referral points:', error);
    return {
      success: false,
      message: 'Failed to award points'
    };
  }
}

/**
 * Get leaderboard
 */
export async function getLeaderboard(limit: number = 10): Promise<Array<{ walletAddress: string; points: number; flips: number }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/leaderboard/top?limit=${limit}`);
    const data = await response.json();
    
    if (data.success && data.leaderboard) {
      return data.leaderboard;
    }
    return [];
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

/**
 * Get oracle signature for resolving a bet
 */
export async function getOracleSignature(betId: number | bigint): Promise<{ success: boolean; random?: string; signature?: string; message?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/oracle/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ betId: betId.toString() }),
    });
    
    const data = await response.json();
    return {
      success: data.success,
      random: data.random,
      signature: data.signature,
      message: data.message
    };
  } catch (error) {
    console.error('Error getting oracle signature:', error);
    return {
      success: false,
      message: 'Failed to get oracle signature'
    };
  }
}

// ==================== CoinFlip Backend API Functions ====================

export interface ContractInfo {
  maxBet: string | null;
  decimals: number | null;
  tokenAddress: string | null;
  oracleSigner: string | null;
  resolveTimeoutBlocks: string | null;
  hasQuotePayout: boolean;
  contractAddress: string;
}

/**
 * Get contract information (max bet, decimals, token address, etc.)
 */
export async function getContractInfo(): Promise<{ success: boolean; data?: ContractInfo; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/contract-info`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error getting contract info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get contract info'
    };
  }
}

export interface ContractStats {
  walletAddress: string;
  plays: string;
  wins: string;
  wagered: string;
  paidOut: string;
}

/**
 * Get user stats from the contract
 */
export async function getContractStats(walletAddress: string): Promise<{ success: boolean; data?: ContractStats; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/stats/${walletAddress}`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error getting contract stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get contract stats'
    };
  }
}

export interface BetInfo {
  betId: string;
  player: string;
  amount: string;
  guess: number;
  status: number; // 0=NONE, 1=PENDING, 2=SETTLED, 3=REFUNDED
  placedAtBlock: string;
  resolved?: {
    betId: string;
    player: string;
    guess: number;
    outcome: number;
    won: boolean;
    amount: string;
    payout: string;
    profit: string;
  } | null;
}

/**
 * Get bet information by betId
 */
export async function getBetInfo(betId: number | bigint | string): Promise<{ success: boolean; data?: BetInfo; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/bet/${betId.toString()}`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error getting bet info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get bet info'
    };
  }
}

export interface PayoutQuote {
  betAmount: string;
  betAmountUnits: string;
  payoutUnits: string;
  payoutFormatted: string;
  decimals: number;
}

/**
 * Quote payout for a given bet amount
 */
export async function quotePayout(amount: number | string): Promise<{ success: boolean; data?: PayoutQuote; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/quote-payout?amount=${amount}`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error quoting payout:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to quote payout'
    };
  }
}

export interface LiquidityInfo {
  contractAddress: string;
  tokenAddress: string;
  balance: string;
  balanceFormatted: string;
  decimals: number;
}

/**
 * Check contract liquidity (USDC balance)
 */
export async function getContractLiquidity(): Promise<{ success: boolean; data?: LiquidityInfo; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/liquidity`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error checking liquidity:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check liquidity'
    };
  }
}

export interface UserBalance {
  walletAddress: string;
  tokenAddress: string;
  balance: string;
  balanceFormatted: string;
  allowance: string;
  allowanceFormatted: string;
  decimals: number;
}

/**
 * Get user's USDC balance and allowance
 */
export async function getUserBalance(walletAddress: string): Promise<{ success: boolean; data?: UserBalance; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/user-balance/${walletAddress}`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error getting user balance:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user balance'
    };
  }
}

export interface BetStatus {
  betId: string;
  status: number; // 0=NONE, 1=PENDING, 2=SETTLED, 3=REFUNDED
  isResolved: boolean;
  isPending: boolean;
  resolved?: {
    betId: string;
    player: string;
    guess: number;
    outcome: number;
    won: boolean;
    amount: string;
    payout: string;
    profit: string;
  } | null;
}

/**
 * Check bet status (quick check if bet is resolved)
 */
export async function getBetStatus(betId: number | bigint | string): Promise<{ success: boolean; data?: BetStatus; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/bet/${betId.toString()}/status`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error checking bet status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check bet status'
    };
  }
}

export interface BetWaitResult {
  betId: string;
  resolved: boolean;
  result?: {
    betId: string;
    player: string;
    guess: number;
    outcome: number;
    won: boolean;
    amount: string;
    payout: string;
    profit: string;
  } | { refunded: boolean } | null;
  message?: string;
}

/**
 * Wait for bet resolution (long polling - waits up to 60 seconds)
 */
export async function waitForBetResolution(
  betId: number | bigint | string,
  timeout: number = 60000,
  interval: number = 2000
): Promise<{ success: boolean; data?: BetWaitResult; error?: string }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/users/coinflip/bet/${betId.toString()}/wait?timeout=${timeout}&interval=${interval}`
    );
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error waiting for bet resolution:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to wait for bet resolution'
    };
  }
}

export interface UserBet {
  betId: string;
  player: string;
  guess: number;
  amount: string;
  clientSeed: string;
  status: number | null;
  placedAtBlock: string;
  blockNumber: number;
  transactionHash: string;
  resolved?: {
    guess: number;
    outcome: number;
    won: boolean;
    amount: string;
    payout: string;
    profit: string;
  } | null;
  error?: string;
}

export interface UserBetsResponse {
  walletAddress: string;
  bets: UserBet[];
  total: number;
}

/**
 * Get recent bets for a user
 */
export async function getUserBets(
  walletAddress: string,
  limit: number = 10,
  fromBlock?: number
): Promise<{ success: boolean; data?: UserBetsResponse; error?: string }> {
  try {
    let url = `${API_BASE_URL}/users/coinflip/user/${walletAddress}/bets?limit=${limit}`;
    if (fromBlock) {
      url += `&fromBlock=${fromBlock}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error getting user bets:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user bets'
    };
  }
}

export interface VerifiedBet {
  betId: string;
  transactionHash: string | null;
  player: string;
  amount: string;
  guess: number;
  status: number;
  placedAtBlock: string;
}

/**
 * Verify bet placement (after user places bet on frontend)
 */
export async function verifyBet(
  transactionHash?: string,
  betId?: number | bigint | string
): Promise<{ success: boolean; data?: VerifiedBet; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/verify-bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionHash: transactionHash || undefined,
        betId: betId ? betId.toString() : undefined
      }),
    });
    
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error verifying bet:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify bet'
    };
  }
}

export interface PendingBetsResponse {
  pending: number;
  resolved: number;
  total: number;
  pendingBets: Array<{
    betId: string;
    player: string;
    guess: number;
    amount: string;
    blockNumber: number;
    transactionHash: string;
    status: number;
    placedAtBlock: string;
    ageBlocks: number;
  }>;
  oldestPendingBlock: string | null;
  currentBlock: number;
}

/**
 * Check for pending bets (to verify oracle is working)
 */
export async function getPendingBets(): Promise<{ success: boolean; data?: PendingBetsResponse; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/pending-bets`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error getting pending bets:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pending bets'
    };
  }
}

export interface OracleStatus {
  oracleConfigured: boolean;
  oracleSigner: string;
  expectedOracle: string | null;
  resolveTimeoutBlocks: string;
  currentBlock: number;
  recentPendingBets: number;
  oracleRunning: boolean;
  message: string;
}

/**
 * Check oracle configuration and status
 */
export async function getOracleStatus(): Promise<{ success: boolean; data?: OracleStatus; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/coinflip/oracle-status`);
    const data = await response.json();
    return {
      success: data.success,
      data: data.data,
      error: data.error
    };
  } catch (error) {
    console.error('Error getting oracle status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get oracle status'
    };
  }
}

/**
 * Resolve bet immediately after placement (no 24/7 service needed)
 * This is called right after user places bet, eliminating need for polling
 * Uses Heroku-deployed bet resolver for fast resolution (no cold starts)
 * OPTIMIZED: Frontend sends clientSeed directly to avoid backend event query
 * Returns outcome immediately (0 = heads, 1 = tails) for instant UX
 */
export async function resolveBetImmediately(betId: number | bigint | string, clientSeed?: number | bigint | string): Promise<{ success: boolean; transactionHash?: string; outcome?: number; error?: string; alreadyResolved?: boolean; pending?: boolean; betStatus?: number }> {
  try {
    // Use Heroku bet resolver service for fast resolution
    const response = await fetch(`${BET_RESOLVER_URL}/oracle/resolve-bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        betId: betId.toString(),
        clientSeed: clientSeed ? clientSeed.toString() : undefined
      }),
    });
    
    const data = await response.json();
    
    // Handle 200 success (including already resolved or pending)
    if (response.ok && data.success) {
      return {
        success: true,
        transactionHash: data.transactionHash,
        outcome: data.outcome !== undefined ? Number(data.outcome) : undefined, // 0 = heads, 1 = tails
        alreadyResolved: data.alreadyResolved || false,
        pending: data.pending || false // Transaction sent but not yet confirmed
      };
    }
    
    // Handle 400 error for "already resolved" or "not pending"
    if (response.status === 400) {
      // Check if bet is already resolved (status 2 = SETTLED)
      if (data.status === 2 || data.alreadyResolved) {
        // Bet was already resolved - this is actually OK, we can get outcome from chain
        return {
          success: true,
          alreadyResolved: true,
          error: data.message || 'Bet was already resolved',
          // Note: outcome not available in 400 response, will need to query from chain
        };
      }
      // Bet is not pending for other reasons (might be refunded, invalid, etc.)
      return {
        success: false,
        error: data.error || data.message || 'Bet is not in a resolvable state',
        betStatus: data.status
      };
    }
    
    // Handle other errors (500, network errors, etc.)
    return {
      success: false,
      error: data.error || data.message || 'Failed to resolve bet'
    };
  } catch (error) {
    console.error('Error resolving bet:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve bet'
    };
  }
}

