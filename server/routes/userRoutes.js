import express from 'express';
import { ethers } from 'ethers';
import { User } from '../models/User.js';
import { getTwitterOAuthUrl, verifyFollowAfterOAuth } from '../utils/twitterVerification.js';
import { getContractInstance, getERC20Contract, getReferralRegistryInstance } from '../utils/contractHelper.js';

const router = express.Router();

// Twitter OAuth callback (MUST be before /:walletAddress route to avoid route conflicts)
router.get('/twitter-callback', async (req, res) => {
  try {
    const { oauth_token, oauth_verifier } = req.query;

    console.log(`[Twitter Callback] Received callback`);
    console.log(`[Twitter Callback] OAuth token present: ${!!oauth_token}, OAuth verifier present: ${!!oauth_verifier}`);

    if (!oauth_token || !oauth_verifier) {
      console.error('[Twitter Callback] Missing OAuth parameters');
      const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173');
      return res.redirect(`${frontendUrl}?twitter_error=missing_params`);
    }

    // IMPORTANT: OAuth 1.0a doesn't support state parameter, so we look up the user by oauth_token
    // The oauth_token was stored in the database when we generated the OAuth URL
    // This allows us to retrieve the wallet address associated with this OAuth session
    const user = await User.findOne({ oauthToken: oauth_token });
    
    if (!user) {
      console.error('[Twitter Callback] User not found for oauth_token:', oauth_token?.substring(0, 20) + '...');
      const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173');
      return res.redirect(`${frontendUrl}?twitter_error=invalid_token`);
    }

    if (!user.oauthTokenSecret) {
      console.error('[Twitter Callback] OAuth token secret not found for user:', user.walletAddress);
      const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173');
      return res.redirect(`${frontendUrl}?twitter_error=invalid_token`);
    }

    const normalizedAddress = user.walletAddress.toLowerCase().trim();
    console.log(`[Twitter Callback] Found user for wallet: ${normalizedAddress}`);

    console.log(`[Twitter Callback] Verifying follow for wallet ${normalizedAddress}`);
    
    // Now verify the follow using the stored secret
    // This will authenticate the USER's Twitter account (not the app owner's)
    const verification = await verifyFollowAfterOAuth(
      oauth_token,
      oauth_verifier,
      user.oauthTokenSecret
    );
    
    console.log(`[Twitter Callback] Verification result:`, {
      isFollowing: verification.isFollowing,
      twitterUserId: verification.twitterUserId,
      trustBased: verification.trustBased || false
    });
    
    // Clear OAuth tokens immediately after use (security best practice)
    user.oauthToken = null;
    user.oauthTokenSecret = null;
    
    // If trust-based (all API methods failed), log warning but allow it
    if (verification.trustBased) {
      console.warn(`[Twitter Callback] ⚠️  Trust-based verification for wallet ${normalizedAddress}`);
      console.warn(`[Twitter Callback] Warning: ${verification.warning || 'Could not verify via API'}`);
    }
    
    if (!verification.isFollowing) {
      console.log(`[Twitter Callback] User ${normalizedAddress} (Twitter ID: ${verification.twitterUserId}) is not following`);
      await user.save();
      const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173');
      return res.redirect(`${frontendUrl}?twitter_error=not_following`);
    }

    // User is following, award points
    const POINTS_PER_TWITTER_FOLLOW = 50;

    // Check if user already followed (prevent duplicate rewards for this wallet)
    if (user.twitterFollowed) {
      console.log(`[Twitter Callback] User ${normalizedAddress} already claimed Twitter follow points`);
      await user.save();
      const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173');
      return res.redirect(`${frontendUrl}?twitter_error=already_claimed`);
    }

    // IMPORTANT: Check if this Twitter account has already been used by another wallet
    // This prevents users from using the same Twitter account to claim points for multiple wallets
    const existingUserWithTwitterId = await User.findOne({ 
      twitterUserId: verification.twitterUserId,
      walletAddress: { $ne: normalizedAddress } // Exclude the current wallet
    });

    if (existingUserWithTwitterId) {
      console.log(`[Twitter Callback] Twitter account ${verification.twitterUserId} (@${verification.twitterUsername}) already used by wallet ${existingUserWithTwitterId.walletAddress}`);
      await user.save();
      const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173');
      return res.redirect(`${frontendUrl}?twitter_error=twitter_already_used`);
    }

    // Award points and mark as followed
    // Store the Twitter user ID to prevent duplicate claims from same Twitter account across different wallets
    user.points += POINTS_PER_TWITTER_FOLLOW;
    user.twitterFollowed = true;
    user.twitterUserId = verification.twitterUserId; // Store the authenticated USER's Twitter ID
    await user.save();

    console.log(`[Twitter Callback] Successfully awarded ${POINTS_PER_TWITTER_FOLLOW} points to wallet ${normalizedAddress}`);
    console.log(`[Twitter Callback] User's Twitter ID: ${verification.twitterUserId}`);
    console.log(`[Twitter Callback] Total points: ${user.points}`);

    const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173');
    return res.redirect(`${frontendUrl}?twitter_success=true&points=${user.points}`);
  } catch (error) {
    console.error('[Twitter Callback] Error in Twitter OAuth callback:', error);
    console.error('[Twitter Callback] Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Provide more specific error information
    let errorType = 'verification_failed';
    if (error.message?.includes('access denied') || error.message?.includes('403')) {
      errorType = 'api_access_denied';
    } else if (error.message?.includes('authentication') || error.message?.includes('401')) {
      errorType = 'authentication_failed';
    } else if (error.message?.includes('not following')) {
      errorType = 'not_following';
    }
    
    const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173');
    return res.redirect(`${frontendUrl}?twitter_error=${errorType}`);
  }
});

// Get or create user
router.get('/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = walletAddress.toLowerCase().trim();

    let user = await User.findOne({ walletAddress: normalizedAddress });

    if (!user) {
      user = new User({
        walletAddress: normalizedAddress,
        points: 0,
        flips: 0
      });
      await user.save();
    }
    
    // Ensure flips is initialized (for existing users who might not have it)
    if (user.flips === undefined || user.flips === null) {
      user.flips = 0;
      await user.save();
    }

    res.json({
      success: true,
      user: {
        walletAddress: user.walletAddress,
        points: user.points,
        flips: user.flips,
        twitterFollowed: user.twitterFollowed,
        referralUsed: user.referralUsed
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user',
      error: error.message
    });
  }
});

// Award points for coin flip
router.post('/:walletAddress/flip', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = walletAddress.toLowerCase().trim();
    const POINTS_FOR_FIRST_FLIP = 100; // First flip gets 100 points
    const POINTS_FOR_SUBSEQUENT_FLIPS = 0; // All subsequent flips get 0 points

    let user = await User.findOne({ walletAddress: normalizedAddress });

    if (!user) {
      user = new User({
        walletAddress: normalizedAddress,
        points: 0,
        flips: 0
      });
    }

    // Ensure flips is initialized (for existing users who might not have it)
    if (user.flips === undefined || user.flips === null) {
      user.flips = 0;
    }
    
    // Check if this is the first flip
    const isFirstFlip = user.flips === 0;
    const pointsToAward = isFirstFlip ? POINTS_FOR_FIRST_FLIP : POINTS_FOR_SUBSEQUENT_FLIPS;
    
    console.log(`[Flip Points] Wallet: ${normalizedAddress}, Current flips: ${user.flips}, Is first flip: ${isFirstFlip}, Points to award: ${pointsToAward}`);

    // Award points and increment flip count
    user.points += pointsToAward;
    user.flips += 1;
    await user.save();

    res.json({
      success: true,
      message: isFirstFlip 
        ? `Awarded ${POINTS_FOR_FIRST_FLIP} points for first flip!`
        : `Flip completed. No points awarded for subsequent flips.`,
      points: user.points,
      pointsAwarded: pointsToAward,
      isFirstFlip: isFirstFlip
    });
  } catch (error) {
    console.error('Error awarding flip points:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award points',
      error: error.message
    });
  }
});

// Get Twitter OAuth URL to start verification
router.get('/:walletAddress/twitter-oauth', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = walletAddress.toLowerCase().trim();
    
    console.log(`[Twitter OAuth] Request from wallet: ${normalizedAddress}`);
    
    // Check if Twitter API is configured
    const hasClientId = process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_ID.trim() !== '';
    const hasClientSecret = process.env.TWITTER_CLIENT_SECRET && process.env.TWITTER_CLIENT_SECRET.trim() !== '';
    
    if (!hasClientId || !hasClientSecret) {
      console.log('[Twitter OAuth] Twitter API not configured - returning trust-based response');
      return res.json({
        success: false,
        message: 'Twitter API not configured. Using trust-based system.',
        trustBased: true
      });
    }

    // Build callback URL - handle both Vercel and local development
    // For Vercel, use the request origin; for local, use localhost
    let protocol = req.protocol || 'https';
    let host = req.get('host') || req.headers.host;
    
    // Check for Vercel headers
    if (req.headers['x-forwarded-proto']) {
      protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
    }
    if (req.headers['x-forwarded-host']) {
      host = req.headers['x-forwarded-host'].split(',')[0].trim();
    }
    
    // Fallback to origin header if available
    if (req.headers.origin && !host.includes('localhost')) {
      try {
        const originUrl = new URL(req.headers.origin);
        protocol = originUrl.protocol.replace(':', '');
        host = originUrl.host;
      } catch (e) {
        console.warn('[Twitter OAuth] Could not parse origin header:', e);
      }
    }
    
    if (!host) {
      console.error('[Twitter OAuth] Cannot determine host for callback URL');
      return res.json({
        success: false,
        message: 'Cannot determine callback URL. Using trust-based system.',
        trustBased: true
      });
    }
    
    // Use a single callback URL (without wallet address) since Twitter doesn't support wildcards
    // OAuth 1.0a doesn't support state parameter, so we'll use oauth_token to look up the wallet address
    const callbackUrl = `${protocol}://${host}/api/users/twitter-callback`;
    console.log(`[Twitter OAuth] Generating OAuth URL for wallet ${normalizedAddress}`);
    console.log(`[Twitter OAuth] Callback URL: ${callbackUrl}`);
    console.log(`[Twitter OAuth] Protocol: ${protocol}, Host: ${host}`);

    try {
      // Generate OAuth URL - the oauth_token will be stored with the wallet address
      // In the callback, we'll look up the user by oauth_token to get the wallet address
      const oauthData = await getTwitterOAuthUrl(callbackUrl, normalizedAddress);
      
      // Store oauth_token_secret in the database for this user
      // This allows us to retrieve it when the callback happens
      let user = await User.findOne({ walletAddress: normalizedAddress });
      
      if (!user) {
        user = new User({
          walletAddress: normalizedAddress,
          points: 0
        });
      }
      
      // Store the oauth_token and oauth_token_secret temporarily
      // These will be used when the user returns from Twitter
      // IMPORTANT: Each user gets their own OAuth tokens - this allows each user to authenticate separately
      user.oauthToken = oauthData.oauth_token;
      user.oauthTokenSecret = oauthData.oauth_token_secret;
      await user.save();
      
      console.log(`[Twitter OAuth] OAuth tokens stored for wallet ${normalizedAddress}`);
      console.log(`[Twitter OAuth] OAuth URL generated successfully`);
      
      // Return only the OAuth URL to the client (don't expose the secret)
      res.json({
        success: true,
        oauthUrl: oauthData.url
      });
    } catch (twitterError) {
      // If Twitter API call fails, fall back to trust-based system
      console.error('[Twitter OAuth] Twitter API error - falling back to trust-based system:', twitterError);
      console.error('[Twitter OAuth] Error details:', {
        message: twitterError.message,
        code: twitterError.code,
        stack: twitterError.stack
      });
      return res.json({
        success: false,
        message: 'Twitter API error. Using trust-based system.',
        trustBased: true,
        error: twitterError.message
      });
    }
  } catch (error) {
    console.error('[Twitter OAuth] Error generating Twitter OAuth URL:', error);
    console.error('[Twitter OAuth] Error stack:', error.stack);
    
    // Always fall back to trust-based system instead of returning 500
    res.json({
      success: false,
      message: 'Failed to generate OAuth URL. Using trust-based system.',
      trustBased: true,
      error: error.message
    });
  }
});

// Award points for Twitter follow (trust-based fallback)
router.post('/:walletAddress/twitter-follow', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = walletAddress.toLowerCase().trim();
    const POINTS_PER_TWITTER_FOLLOW = 50;

    // Check if Twitter API is configured
    const twitterConfigured = process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET;
    
    if (twitterConfigured) {
      return res.json({
        success: false,
        message: 'Twitter OAuth verification is required. Please use the "Verify & Claim 50 Points" button.',
        requiresOAuth: true
      });
    }

    // Trust-based system (fallback when Twitter API not configured)
    let user = await User.findOne({ walletAddress: normalizedAddress });

    if (!user) {
      user = new User({
        walletAddress: normalizedAddress,
        points: 0
      });
    }

    // Check if user already followed (prevent duplicate rewards)
    if (user.twitterFollowed) {
      return res.json({
        success: false,
        message: 'Twitter follow points already awarded',
        points: user.points
      });
    }

    // Award points and mark as followed
    user.points += POINTS_PER_TWITTER_FOLLOW;
    user.twitterFollowed = true;
    await user.save();

    res.json({
      success: true,
      message: `Awarded ${POINTS_PER_TWITTER_FOLLOW} points for Twitter follow`,
      points: user.points,
      pointsAwarded: POINTS_PER_TWITTER_FOLLOW,
      trustBased: true
    });
  } catch (error) {
    console.error('Error awarding Twitter follow points:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award points',
      error: error.message
    });
  }
});

// Award points for referral - referrer gets 20 points when someone uses their code
router.post('/:walletAddress/referral', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = walletAddress.toLowerCase().trim();
    const POINTS_FOR_NEW_USER = 0; // New user gets 0 points
    const POINTS_FOR_REFERRER = 20; // Referrer gets 20 points for each new referral

    // Check if user already used referral (prevent duplicate rewards)
    let user = await User.findOne({ walletAddress: normalizedAddress });
    if (!user) {
      user = new User({
        walletAddress: normalizedAddress,
        points: 0
      });
    }

    if (user.referralUsed) {
      return res.json({
        success: false,
        message: 'Referral points already awarded',
        points: user.points
      });
    }

    // Get referrer address from the contract
    let referrerAddress = null;
    try {
      const { contract } = getReferralRegistryInstance();
      referrerAddress = await contract.referrerOf(normalizedAddress);
      
      // Check if referrer is valid (not zero address)
      if (referrerAddress && referrerAddress !== ethers.ZeroAddress) {
        referrerAddress = referrerAddress.toLowerCase().trim();
        
        // Prevent self-referral
        if (normalizedAddress === referrerAddress) {
          referrerAddress = null;
        } else {
          // Award 20 points to the referrer
          let referrer = await User.findOne({ walletAddress: referrerAddress });
          if (!referrer) {
            referrer = new User({
              walletAddress: referrerAddress,
              points: 0
            });
          }
          
          referrer.points += POINTS_FOR_REFERRER;
          await referrer.save();
          
          console.log(`Awarded ${POINTS_FOR_REFERRER} points to referrer ${referrerAddress}. New total: ${referrer.points}`);
        }
      }
    } catch (referralError) {
      console.error('Error getting referrer from contract:', referralError);
      // Continue even if we can't get referrer - still mark user as having used referral
    }

    // Award 0 points to new user and mark as used
    user.points += POINTS_FOR_NEW_USER;
    user.referralUsed = true;
    await user.save();

    res.json({
      success: true,
      message: referrerAddress 
        ? `Referral applied. Referrer earned ${POINTS_FOR_REFERRER} points.`
        : `Referral applied.`,
      points: user.points,
      pointsAwarded: POINTS_FOR_NEW_USER,
      referrerAwarded: referrerAddress ? POINTS_FOR_REFERRER : 0
    });
  } catch (error) {
    console.error('Error awarding referral points:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award points',
      error: error.message
    });
  }
});

// Get leaderboard
router.get('/leaderboard/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const users = await User.find({})
      .sort({ points: -1 })
      .limit(limit)
      .select('walletAddress points flips -_id');

    res.json({
      success: true,
      leaderboard: users
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboard',
      error: error.message
    });
  }
});

// Oracle endpoint to generate signature for resolving bets
router.post('/oracle/resolve', async (req, res) => {
  try {
    const { betId } = req.body;
    
    if (!betId) {
      return res.status(400).json({
        success: false,
        message: 'betId is required'
      });
    }

    const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
    if (!ORACLE_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Oracle private key not configured'
      });
    }

    // Convert betId to BigInt (handles both string and number)
    const betIdBigInt = BigInt(betId);
    
    // Generate random value (32 bytes)
    const random = ethers.randomBytes(32);
    
    // Create message hash: keccak256(abi.encodePacked(betId, random))
    // This matches the contract's: keccak256(abi.encodePacked(betId, random))
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(['uint256', 'bytes32'], [betIdBigInt, random])
    );
    
    // Sign with Ethereum message prefix (matches ECDSA.toEthSignedMessageHash)
    // signMessage automatically adds the "\x19Ethereum Signed Message:\n32" prefix
    const wallet = new ethers.Wallet(ORACLE_PRIVATE_KEY);
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));
    
    // Convert random bytes to hex string (0x prefixed)
    const randomHex = ethers.hexlify(random);
    
    res.json({
      success: true,
      random: randomHex,
      signature: signature
    });
  } catch (error) {
    console.error('Error generating oracle signature:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate signature',
      error: error.message
    });
  }
});

// ==================== CoinFlip Backend Routes ====================

// Get contract information (max bet, decimals, token address, etc.)
router.get('/coinflip/contract-info', async (req, res) => {
  try {
    const { contract, provider } = getContractInstance();
    
    const [maxBet, decimals, tokenAddress, oracleSigner, resolveTimeoutBlocks] = await Promise.all([
      contract.maxBet().catch(() => null),
      contract.decimals_().catch(() => null),
      contract.token().catch(() => null),
      contract.oracleSigner().catch(() => null),
      contract.resolveTimeoutBlocks().catch(() => null)
    ]);

    // Check if contract has quotePayout function
    let hasQuotePayout = false;
    try {
      contract.interface.getFunction("quotePayout(uint256)");
      hasQuotePayout = true;
    } catch {}

    res.json({
      success: true,
      data: {
        maxBet: maxBet ? maxBet.toString() : null,
        decimals: decimals ? Number(decimals) : null,
        tokenAddress: tokenAddress || null,
        oracleSigner: oracleSigner || null,
        resolveTimeoutBlocks: resolveTimeoutBlocks ? resolveTimeoutBlocks.toString() : null,
        hasQuotePayout,
        contractAddress: process.env.COINFLIP_ADDRESS
      }
    });
  } catch (error) {
    console.error('Error getting contract info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get contract information',
      error: error.message
    });
  }
});

// Get user stats from the contract
router.get('/coinflip/stats/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = ethers.getAddress(walletAddress.toLowerCase().trim());
    
    const { contract } = getContractInstance();
    
    const stats = await contract.stats(normalizedAddress);
    
    res.json({
      success: true,
      data: {
        walletAddress: normalizedAddress,
        plays: stats.plays.toString(),
        wins: stats.wins.toString(),
        wagered: stats.wagered.toString(),
        paidOut: stats.paidOut.toString()
      }
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    
    // Handle case where stats function doesn't exist or returns error
    if (error.code === 'CALL_EXCEPTION' || error.message?.includes('could not decode')) {
      return res.json({
        success: true,
        data: {
          walletAddress: req.params.walletAddress.toLowerCase().trim(),
          plays: '0',
          wins: '0',
          wagered: '0',
          paidOut: '0'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to get user stats',
      error: error.message
    });
  }
});

// Get bet information by betId
router.get('/coinflip/bet/:betId', async (req, res) => {
  try {
    const { betId } = req.params;
    const betIdBigInt = BigInt(betId);
    
    const { contract, provider } = getContractInstance();
    
    const betInfo = await contract.bets(betIdBigInt);
    
    // Get BetResolved event if bet is resolved
    let resolvedEvent = null;
    if (Number(betInfo.status) === 2) { // SETTLED
      try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(Number(betInfo.placedAtBlock) - 100, 0);
        
        const filter = contract.filters.BetResolved(betIdBigInt);
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);
        
        if (events.length > 0) {
          const event = events[events.length - 1];
          const parsed = contract.interface.parseLog(event);
          resolvedEvent = {
            betId: parsed.args[0].toString(),
            player: parsed.args[1],
            guess: Number(parsed.args[2]),
            outcome: Number(parsed.args[3]),
            won: parsed.args[4] === true || parsed.args[4] === 1n || parsed.args[4] === 1,
            amount: parsed.args[5].toString(),
            payout: parsed.args[6].toString(),
            profit: parsed.args[7].toString()
          };
        }
      } catch (eventError) {
        console.warn('Could not fetch BetResolved event:', eventError);
      }
    }
    
    res.json({
      success: true,
      data: {
        betId: betId,
        player: betInfo.player,
        amount: betInfo.amount.toString(),
        guess: Number(betInfo.guess),
        status: Number(betInfo.status), // 0=NONE, 1=PENDING, 2=SETTLED, 3=REFUNDED
        placedAtBlock: betInfo.placedAtBlock.toString(),
        resolved: resolvedEvent
      }
    });
  } catch (error) {
    console.error('Error getting bet info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bet information',
      error: error.message
    });
  }
});

// Quote payout for a given bet amount
router.get('/coinflip/quote-payout', async (req, res) => {
  try {
    const { amount } = req.query;
    
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'amount parameter is required'
      });
    }
    
    const { contract } = getContractInstance();
    
    // Get decimals first
    const decimals = await contract.decimals_().catch(() => 6);
    const decimalsNum = Number(decimals);
    
    // Parse amount (assuming it's in human-readable format, e.g., "1" for 1 USDC)
    const amountUnits = ethers.parseUnits(String(amount), decimalsNum);
    
    // Try to use quotePayout if available
    let payout = null;
    try {
      payout = await contract.quotePayout(amountUnits);
    } catch {
      // Fallback to 1.95x calculation
      payout = (amountUnits * 195n) / 100n;
    }
    
    res.json({
      success: true,
      data: {
        betAmount: amount,
        betAmountUnits: amountUnits.toString(),
        payoutUnits: payout.toString(),
        payoutFormatted: ethers.formatUnits(payout, decimalsNum),
        decimals: decimalsNum
      }
    });
  } catch (error) {
    console.error('Error quoting payout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to quote payout',
      error: error.message
    });
  }
});

// Check contract liquidity (USDC balance)
router.get('/coinflip/liquidity', async (req, res) => {
  try {
    const { contract, provider } = getContractInstance();
    
    const tokenAddress = await contract.token();
    const erc20Contract = getERC20Contract(tokenAddress, provider);
    
    const balance = await erc20Contract.balanceOf(process.env.COINFLIP_ADDRESS);
    const decimals = await contract.decimals_().catch(() => 6);
    const decimalsNum = Number(decimals);
    
    res.json({
      success: true,
      data: {
        contractAddress: process.env.COINFLIP_ADDRESS,
        tokenAddress: tokenAddress,
        balance: balance.toString(),
        balanceFormatted: ethers.formatUnits(balance, decimalsNum),
        decimals: decimalsNum
      }
    });
  } catch (error) {
    console.error('Error checking liquidity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check liquidity',
      error: error.message
    });
  }
});

// Get user's USDC balance and allowance
router.get('/coinflip/user-balance/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = ethers.getAddress(walletAddress.toLowerCase().trim());
    
    const { contract, provider } = getContractInstance();
    
    const tokenAddress = await contract.token();
    const erc20Contract = getERC20Contract(tokenAddress, provider);
    const decimals = await contract.decimals_().catch(() => 6);
    const decimalsNum = Number(decimals);
    
    const [balance, allowance] = await Promise.all([
      erc20Contract.balanceOf(normalizedAddress),
      erc20Contract.allowance(normalizedAddress, process.env.COINFLIP_ADDRESS)
    ]);
    
    res.json({
      success: true,
      data: {
        walletAddress: normalizedAddress,
        tokenAddress: tokenAddress,
        balance: balance.toString(),
        balanceFormatted: ethers.formatUnits(balance, decimalsNum),
        allowance: allowance.toString(),
        allowanceFormatted: ethers.formatUnits(allowance, decimalsNum),
        decimals: decimalsNum
      }
    });
  } catch (error) {
    console.error('Error getting user balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user balance',
      error: error.message
    });
  }
});

// Check bet status (quick check if bet is resolved)
router.get('/coinflip/bet/:betId/status', async (req, res) => {
  try {
    const { betId } = req.params;
    const betIdBigInt = BigInt(betId);
    
    const { contract, provider } = getContractInstance();
    
    const betInfo = await contract.bets(betIdBigInt);
    const status = Number(betInfo.status);
    
    // If resolved, get the BetResolved event
    let resolvedData = null;
    if (status === 2) { // SETTLED
      try {
        const placedBlock = Number(betInfo.placedAtBlock);
        const currentBlock = await provider.getBlockNumber();
        // Use small range around placed block (respects 10-block limit)
        const fromBlock = Math.max(placedBlock - 5, 0);
        const toBlock = Math.min(placedBlock + 10, currentBlock);
        
        const filter = contract.filters.BetResolved(betIdBigInt);
        const events = await contract.queryFilter(filter, fromBlock, toBlock);
        
        if (events.length > 0) {
          const event = events[events.length - 1];
          const parsed = contract.interface.parseLog(event);
          resolvedData = {
            betId: parsed.args[0].toString(),
            player: parsed.args[1],
            guess: Number(parsed.args[2]),
            outcome: Number(parsed.args[3]),
            won: parsed.args[4] === true || parsed.args[4] === 1n || parsed.args[4] === 1,
            amount: parsed.args[5].toString(),
            payout: parsed.args[6].toString(),
            profit: parsed.args[7].toString()
          };
        }
      } catch (eventError) {
        console.warn('Could not fetch BetResolved event:', eventError);
      }
    }
    
    res.json({
      success: true,
      data: {
        betId: betId,
        status: status, // 0=NONE, 1=PENDING, 2=SETTLED, 3=REFUNDED
        isResolved: status === 2,
        isPending: status === 1,
        resolved: resolvedData
      }
    });
  } catch (error) {
    console.error('Error checking bet status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check bet status',
      error: error.message
    });
  }
});

// Wait for bet resolution (long polling - waits up to 60 seconds)
router.get('/coinflip/bet/:betId/wait', async (req, res) => {
  try {
    const { betId } = req.params;
    const betIdBigInt = BigInt(betId);
    const maxWaitTime = parseInt(req.query.timeout) || 60000; // Default 60 seconds
    const pollInterval = parseInt(req.query.interval) || 2000; // Default 2 seconds
    
    const { contract, provider } = getContractInstance();
    
    const startTime = Date.now();
    let resolved = false;
    let resolvedData = null;
    
    while (!resolved && (Date.now() - startTime) < maxWaitTime) {
      try {
        const betInfo = await contract.bets(betIdBigInt);
        const status = Number(betInfo.status);
        
        if (status === 2) { // SETTLED
          resolved = true;
          
          // Get the BetResolved event
          const placedBlock = Number(betInfo.placedAtBlock);
          const currentBlock = await provider.getBlockNumber();
          // Use small range around placed block (respects 10-block limit)
          const fromBlock = Math.max(placedBlock - 5, 0);
          const toBlock = Math.min(placedBlock + 10, currentBlock);
          
          const filter = contract.filters.BetResolved(betIdBigInt);
          const events = await contract.queryFilter(filter, fromBlock, toBlock);
          
          if (events.length > 0) {
            const event = events[events.length - 1];
            const parsed = contract.interface.parseLog(event);
            resolvedData = {
              betId: parsed.args[0].toString(),
              player: parsed.args[1],
              guess: Number(parsed.args[2]),
              outcome: Number(parsed.args[3]),
              won: parsed.args[4] === true || parsed.args[4] === 1n || parsed.args[4] === 1,
              amount: parsed.args[5].toString(),
              payout: parsed.args[6].toString(),
              profit: parsed.args[7].toString()
            };
          }
        } else if (status === 3) { // REFUNDED
          resolved = true;
          resolvedData = { refunded: true };
        }
      } catch (pollError) {
        console.error('Error polling bet:', pollError);
      }
      
      if (!resolved) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    if (resolved && resolvedData) {
      res.json({
        success: true,
        data: {
          betId: betId,
          resolved: true,
          result: resolvedData
        }
      });
    } else {
      res.json({
        success: false,
        data: {
          betId: betId,
          resolved: false,
          message: 'Bet not resolved within timeout period'
        }
      });
    }
  } catch (error) {
    console.error('Error waiting for bet resolution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to wait for bet resolution',
      error: error.message
    });
  }
});

// Get recent bets for a user
router.get('/coinflip/user/:walletAddress/bets', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const normalizedAddress = ethers.getAddress(walletAddress.toLowerCase().trim());
    const limit = parseInt(req.query.limit) || 10;
    const fromBlock = parseInt(req.query.fromBlock) || 0;
    
    const { contract, provider } = getContractInstance();
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    // Limit to reasonable range to avoid RPC limits (can be increased if user provides fromBlock)
    const maxBlocksToCheck = fromBlock > 0 ? (currentBlock - fromBlock) : 50;
    const queryFromBlock = fromBlock > 0 ? fromBlock : Math.max(0, currentBlock - maxBlocksToCheck);
    
    // Query BetPlaced events for this user (in chunks to respect RPC limits)
    const filter = contract.filters.BetPlaced(null, normalizedAddress); // Filter by player address
    const events = await queryEventsInChunks(contract, filter, queryFromBlock, currentBlock, 10);
    
    // Sort by block number (most recent first) and limit
    const sortedEvents = events
      .sort((a, b) => b.blockNumber - a.blockNumber)
      .slice(0, limit);
    
    // Get bet details for each event
    const bets = await Promise.all(
      sortedEvents.map(async (event) => {
        const parsed = contract.interface.parseLog(event);
        const betId = parsed.args[0];
        
        try {
          const betInfo = await contract.bets(betId);
          const status = Number(betInfo.status);
          
          // Try to get BetResolved event if settled
          let resolvedData = null;
          if (status === 2) {
            try {
              const resolvedFilter = contract.filters.BetResolved(betId);
              const eventBlock = event.blockNumber;
              // Use small range around event block (respects 10-block limit)
              const fromBlock = Math.max(eventBlock - 5, 0);
              const toBlock = Math.min(eventBlock + 10, currentBlock);
              const resolvedEvents = await contract.queryFilter(
                resolvedFilter,
                fromBlock,
                toBlock
              );
              
              if (resolvedEvents.length > 0) {
                const resolvedEvent = resolvedEvents[resolvedEvents.length - 1];
                const resolvedParsed = contract.interface.parseLog(resolvedEvent);
                resolvedData = {
                  guess: Number(resolvedParsed.args[2]),
                  outcome: Number(resolvedParsed.args[3]),
                  won: resolvedParsed.args[4] === true || resolvedParsed.args[4] === 1n || resolvedParsed.args[4] === 1,
                  amount: resolvedParsed.args[5].toString(),
                  payout: resolvedParsed.args[6].toString(),
                  profit: resolvedParsed.args[7].toString()
                };
              }
            } catch (e) {
              // Ignore if can't get resolved event
            }
          }
          
          return {
            betId: betId.toString(),
            player: parsed.args[1],
            guess: Number(parsed.args[2]),
            amount: parsed.args[3].toString(),
            clientSeed: parsed.args[4].toString(),
            status: status,
            placedAtBlock: betInfo.placedAtBlock.toString(),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            resolved: resolvedData
          };
        } catch (error) {
          console.error(`Error getting bet ${betId}:`, error);
          return {
            betId: betId.toString(),
            player: parsed.args[1],
            guess: Number(parsed.args[2]),
            amount: parsed.args[3].toString(),
            clientSeed: parsed.args[4].toString(),
            status: null,
            error: error.message
          };
        }
      })
    );
    
    res.json({
      success: true,
      data: {
        walletAddress: normalizedAddress,
        bets: bets,
        total: events.length
      }
    });
  } catch (error) {
    console.error('Error getting user bets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user bets',
      error: error.message
    });
  }
});

// Verify bet placement (after user places bet on frontend, can verify here)
router.post('/coinflip/verify-bet', async (req, res) => {
  try {
    const { transactionHash, betId } = req.body;
    
    if (!transactionHash && !betId) {
      return res.status(400).json({
        success: false,
        message: 'transactionHash or betId is required'
      });
    }
    
    const { contract, provider } = getContractInstance();
    
    let betIdToCheck = betId;
    
    // If only transactionHash provided, get betId from transaction receipt
    if (!betIdToCheck && transactionHash) {
      const receipt = await provider.getTransactionReceipt(transactionHash);
      if (!receipt) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }
      
      // Find BetPlaced event
      const betPlacedEvent = receipt.logs.find((log) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'BetPlaced';
        } catch {
          return false;
        }
      });
      
      if (!betPlacedEvent) {
        return res.status(400).json({
          success: false,
          message: 'BetPlaced event not found in transaction'
        });
      }
      
      const parsed = contract.interface.parseLog(betPlacedEvent);
      betIdToCheck = parsed.args[0].toString();
    }
    
    // Get bet info
    const betInfo = await contract.bets(betIdToCheck);
    
    res.json({
      success: true,
      data: {
        betId: betIdToCheck,
        transactionHash: transactionHash || null,
        player: betInfo.player,
        amount: betInfo.amount.toString(),
        guess: Number(betInfo.guess),
        status: Number(betInfo.status),
        placedAtBlock: betInfo.placedAtBlock.toString()
      }
    });
  } catch (error) {
    console.error('Error verifying bet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify bet',
      error: error.message
    });
  }
});

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

// Check for pending bets (to verify oracle is working)
router.get('/coinflip/pending-bets', async (req, res) => {
  try {
    const { contract, provider } = getContractInstance();
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    // Limit to last 50 blocks to avoid RPC limits (can be increased if needed)
    const maxBlocksToCheck = parseInt(req.query.maxBlocks) || 50;
    const fromBlock = Math.max(0, currentBlock - maxBlocksToCheck);
    
    // Query for all BetPlaced events in chunks (respects 10-block limit)
    const filter = contract.filters.BetPlaced();
    const events = await queryEventsInChunks(contract, filter, fromBlock, currentBlock, 10);
    
    // Check status of each bet
    const pendingBets = [];
    const resolvedBets = [];
    
    for (const event of events) {
      const parsed = contract.interface.parseLog(event);
      const betId = parsed.args[0];
      
      try {
        const betInfo = await contract.bets(betId);
        const status = Number(betInfo.status);
        
        const betData = {
          betId: betId.toString(),
          player: parsed.args[1],
          guess: Number(parsed.args[2]),
          amount: parsed.args[3].toString(),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          status: status,
          placedAtBlock: betInfo.placedAtBlock.toString(),
          ageBlocks: currentBlock - Number(betInfo.placedAtBlock)
        };
        
        if (status === 1) { // PENDING
          pendingBets.push(betData);
        } else if (status === 2) { // SETTLED
          resolvedBets.push(betData);
        }
      } catch (error) {
        console.error(`Error checking bet ${betId}:`, error);
      }
    }
    
    res.json({
      success: true,
      data: {
        pending: pendingBets.length,
        resolved: resolvedBets.length,
        total: events.length,
        pendingBets: pendingBets,
        oldestPendingBlock: pendingBets.length > 0 
          ? Math.min(...pendingBets.map(b => b.placedAtBlock))
          : null,
        currentBlock: currentBlock
      }
    });
  } catch (error) {
    console.error('Error checking pending bets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check pending bets',
      error: error.message
    });
  }
});

// Check oracle configuration and status
router.get('/coinflip/oracle-status', async (req, res) => {
  try {
    const { contract, provider } = getContractInstance();
    
    // Check oracle signer
    const oracleSigner = await contract.oracleSigner();
    const expectedOracle = process.env.PRIVATE_KEY 
      ? new ethers.Wallet(process.env.PRIVATE_KEY, provider).address 
      : null;
    
    const oracleConfigured = expectedOracle && 
      oracleSigner.toLowerCase() === expectedOracle.toLowerCase();
    
    // Check resolve timeout
    const resolveTimeoutBlocks = await contract.resolveTimeoutBlocks();
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    
    // Check for recent pending bets (limit to 10 blocks for free tier RPC)
    const fromBlock = Math.max(0, currentBlock - 10);
    const filter = contract.filters.BetPlaced();
    const recentEvents = await queryEventsInChunks(contract, filter, fromBlock, currentBlock, 10);
    
    let pendingCount = 0;
    for (const event of recentEvents) {
      try {
        const parsed = contract.interface.parseLog(event);
        const betId = parsed.args[0];
        const betInfo = await contract.bets(betId);
        if (Number(betInfo.status) === 1) {
          pendingCount++;
        }
      } catch (e) {
        // Ignore
      }
    }
    
    res.json({
      success: true,
      data: {
        oracleConfigured: oracleConfigured,
        oracleSigner: oracleSigner,
        expectedOracle: expectedOracle,
        resolveTimeoutBlocks: resolveTimeoutBlocks.toString(),
        currentBlock: currentBlock,
        recentPendingBets: pendingCount,
        oracleRunning: oracleConfigured, // Best guess - actual status requires oracle process
        message: oracleConfigured 
          ? 'Oracle configuration looks correct. Make sure oracle.js is running.'
          : 'Oracle signer mismatch. Check PRIVATE_KEY in .env matches contract oracleSigner.'
      }
    });
  } catch (error) {
    console.error('Error checking oracle status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check oracle status',
      error: error.message
    });
  }
});

export { router as userRoutes };

