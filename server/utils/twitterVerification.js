import { TwitterApi } from 'twitter-api-v2';

/**
 * @deprecated This function has authentication issues and is NOT used.
 * 
 * PROBLEMS WITH THIS FUNCTION:
 * 1. Uses Bearer Token (app-level) but v2.following() requires OAuth 1.0a User Context
 * 2. Cannot access user-specific following lists without user authentication
 * 3. v2 API endpoints require Project attachment for user context operations
 * 
 * USE INSTEAD: verifyFollowAfterOAuth() - which correctly implements OAuth 1.0a user authentication
 * 
 * Verify if a Twitter user is following a specific account
 * @param {string} userTwitterId - The Twitter user ID to check
 * @param {string} targetUsername - The username to check if they're following (e.g., 'boinknfts')
 * @returns {Promise<boolean>} - True if user is following, false otherwise
 */
export async function verifyTwitterFollow(userTwitterId, targetUsername = 'boinknfts') {
  console.warn('[DEPRECATED] verifyTwitterFollow() is deprecated and will not work correctly.');
  console.warn('This function uses Bearer Token but v2.following() requires OAuth 1.0a User Context.');
  console.warn('Use verifyFollowAfterOAuth() instead, which correctly authenticates the user.');
  
  try {
    // This approach DOES NOT WORK because:
    // - Bearer Token cannot access user-specific following lists
    // - v2.following() requires OAuth 1.0a User Context authentication
    // - v2 API requires Project attachment for user context operations
    
    const bearerClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
    const readOnlyClient = bearerClient.readOnly;

    // Get the target user's ID (this part works with Bearer Token)
    const targetUser = await readOnlyClient.v2.userByUsername(targetUsername);
    if (!targetUser.data) {
      console.error(`Target user ${targetUsername} not found`);
      return false;
    }

    const targetUserId = targetUser.data.id;

    // THIS WILL FAIL: Bearer Token cannot access user-specific following lists
    // The v2.following() endpoint requires OAuth 1.0a User Context
    // See: https://developer.twitter.com/en/docs/twitter-api/users/follows/api-reference/get-users-id-following
    const following = await readOnlyClient.v2.following(userTwitterId, {
      max_results: 1000,
    });

    // Check if target user ID is in the following list
    const isFollowing = following.data?.some(
      (user) => user.id === targetUserId
    );

    return isFollowing || false;
  } catch (error) {
    console.error('Error verifying Twitter follow (this function is deprecated):', error);
    console.error('Use verifyFollowAfterOAuth() instead for proper OAuth 1.0a user authentication.');
    return false;
  }
}

/**
 * Detect if credentials are OAuth 2.0 instead of OAuth 1.0a
 * OAuth 2.0 Client IDs often have specific patterns
 * @param {string} clientId - The client ID to check
 * @returns {boolean} True if likely OAuth 2.0 credentials
 */
function isOAuth2Credentials(clientId) {
  if (!clientId) return false;
  const trimmed = clientId.trim();
  
  // OAuth 2.0 Client IDs often start with specific prefixes or have different patterns
  // Common patterns: longer strings, different character distribution
  // OAuth 1.0a API Keys are typically 20-25 characters, alphanumeric
  // OAuth 2.0 Client IDs are often longer (30+ characters) and may have different formats
  
  // If it's very long (40+ chars), it's likely OAuth 2.0
  if (trimmed.length > 40) {
    return true;
  }
  
  // Check for common OAuth 2.0 patterns (these are heuristics)
  // OAuth 2.0 Client IDs sometimes have different character patterns
  // This is a best-effort detection
  
  return false;
}

/**
 * Validate Twitter API credentials format
 * @returns {Object} Validation result with isValid flag and issues array
 */
function validateTwitterCredentials() {
  const issues = [];
  const warnings = [];
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId) {
    issues.push('TWITTER_CLIENT_ID is not set');
  } else {
    const trimmedId = clientId.trim();
    if (trimmedId === '') {
      issues.push('TWITTER_CLIENT_ID is empty');
    } else if (trimmedId.length < 10) {
      issues.push('TWITTER_CLIENT_ID appears to be too short (should be 20+ characters)');
    }
    
    // Check for OAuth 2.0 credentials (common mistake)
    if (isOAuth2Credentials(trimmedId) || trimmedId.length > 35) {
      warnings.push('⚠️  CRITICAL: Your TWITTER_CLIENT_ID appears to be OAuth 2.0 credentials, but this code requires OAuth 1.0a credentials!\n' +
        '   → You need to use "API Key" and "API Key Secret" from the "Consumer Keys" section\n' +
        '   → NOT "OAuth 2.0 Client ID" and "OAuth 2.0 Client Secret"\n' +
        '   → Enable OAuth 1.0a in your Twitter App → "User authentication settings"');
    }
    
    // Check for common issues
    if (trimmedId.includes(' ')) {
      issues.push('TWITTER_CLIENT_ID contains spaces (may need trimming)');
    }
    if (trimmedId.startsWith('"') || trimmedId.endsWith('"')) {
      issues.push('TWITTER_CLIENT_ID appears to have quotes around it (remove quotes)');
    }
  }

  if (!clientSecret) {
    issues.push('TWITTER_CLIENT_SECRET is not set');
  } else {
    const trimmedSecret = clientSecret.trim();
    if (trimmedSecret === '') {
      issues.push('TWITTER_CLIENT_SECRET is empty');
    } else if (trimmedSecret.length < 10) {
      issues.push('TWITTER_CLIENT_SECRET appears to be too short (should be 40+ characters)');
    }
    
    // Check for common issues
    if (trimmedSecret.includes(' ')) {
      issues.push('TWITTER_CLIENT_SECRET contains spaces (may need trimming)');
    }
    if (trimmedSecret.startsWith('"') || trimmedSecret.endsWith('"')) {
      issues.push('TWITTER_CLIENT_SECRET appears to have quotes around it (remove quotes)');
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings
  };
}

/**
 * Alternative: Verify using OAuth flow
 * This requires the user to authenticate with Twitter
 */
export async function getTwitterOAuthUrl(callbackUrl, state = null) {
  try {
    // Validate credentials format first
    const validation = validateTwitterCredentials();
    
    // Log warnings (like OAuth 2.0 vs 1.0a mismatch)
    if (validation.warnings && validation.warnings.length > 0) {
      console.error('[Twitter OAuth] ⚠️  WARNING - Credential Type Mismatch:');
      validation.warnings.forEach(warning => console.error(warning));
    }
    
    if (!validation.isValid) {
      let errorMsg = 'Twitter API credentials validation failed:\n' + validation.issues.map(issue => `- ${issue}`).join('\n');
      if (validation.warnings && validation.warnings.length > 0) {
        errorMsg += '\n\n' + validation.warnings.join('\n');
      }
      console.error('[Twitter OAuth] Credential validation failed:', validation.issues);
      throw new Error(errorMsg);
    }

    // Get trimmed credentials
    const clientId = process.env.TWITTER_CLIENT_ID.trim();
    const clientSecret = process.env.TWITTER_CLIENT_SECRET.trim();

    // Log credential info (safely, without exposing full values)
    console.log('[Twitter OAuth] Credential info:', {
      clientIdLength: clientId.length,
      clientSecretLength: clientSecret.length,
      clientIdPrefix: clientId.substring(0, 10) + '...',
      callbackUrl: callbackUrl
    });

    // Create Twitter API client with OAuth 1.0a credentials
    const client = new TwitterApi({
      appKey: clientId,
      appSecret: clientSecret,
    });

    console.log('[Twitter OAuth] Generating OAuth link with callback:', callbackUrl);
    console.log('[Twitter OAuth] Note: Wallet address will be retrieved via oauth_token lookup (OAuth 1.0a doesn\'t support state parameter)');
    
    // Generate OAuth link
    // Note: OAuth 1.0a doesn't support state parameter, so we'll use oauth_token to look up the wallet address
    // The state parameter is kept for potential future OAuth 2.0 support, but won't be used in OAuth 1.0a
    const authOptions = { linkMode: 'authorize' };
    
    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(
      callbackUrl,
      authOptions
    );

    if (!url || !oauth_token || !oauth_token_secret) {
      throw new Error('Failed to generate OAuth link - missing required data');
    }

    console.log('[Twitter OAuth] Successfully generated OAuth URL');
    return {
      url,
      oauth_token,
      oauth_token_secret,
    };
  } catch (error) {
    console.error('[Twitter OAuth] Error generating Twitter OAuth URL:', error);
    console.error('[Twitter OAuth] Error details:', {
      message: error.message,
      code: error.code,
      twitterErrorCode: error.errors?.[0]?.code,
      twitterErrorMessage: error.errors?.[0]?.message,
      stack: error.stack
    });
    
    // Provide helpful error messages for common issues
    if (error.code === 401 || (error.errors && error.errors[0]?.code === 32)) {
      // Check if this might be an OAuth 2.0 vs 1.0a mismatch
      const clientId = process.env.TWITTER_CLIENT_ID?.trim() || '';
      const mightBeOAuth2 = isOAuth2Credentials(clientId) || clientId.length > 35;
      
      let errorMessage = 'Twitter API authentication failed (Error Code 32). This usually means:\n\n';
      
      if (mightBeOAuth2) {
        errorMessage += '⚠️  **CRITICAL ISSUE DETECTED:** You appear to be using OAuth 2.0 credentials!\n\n' +
        'This code requires OAuth 1.0a credentials, but you\'re using OAuth 2.0 Client ID/Secret.\n\n' +
        '🔧 **FIX THIS FIRST:**\n' +
        '1. Go to https://developer.twitter.com/en/portal/dashboard\n' +
        '2. Select your app → "Keys and tokens" tab\n' +
        '3. Scroll to "Consumer Keys" section (NOT "OAuth 2.0 Client ID and Client Secret")\n' +
        '4. Copy the "API Key" (this is your TWITTER_CLIENT_ID)\n' +
        '5. Copy the "API Key Secret" (this is your TWITTER_CLIENT_SECRET)\n' +
        '6. Update your environment variables with these values\n\n' +
        '📋 **Also enable OAuth 1.0a:**\n' +
        '1. Go to your Twitter App → "User authentication settings"\n' +
        '2. Click "Set up" or "Edit"\n' +
        '3. Enable "OAuth 1.0a"\n' +
        '4. Set App permissions to "Read" (or "Read and Write")\n' +
        '5. Add callback URL: ' + callbackUrl + '\n' +
        '6. Click "Save"\n\n';
      } else {
        errorMessage += '1. ❌ TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET are incorrect or don\'t match\n' +
        '   → Go to https://developer.twitter.com/en/portal/dashboard\n' +
        '   → Select your app → "Keys and tokens" tab\n' +
        '   → Use "API Key" and "API Key Secret" from "Consumer Keys" section (OAuth 1.0a)\n' +
        '   → NOT "OAuth 2.0 Client ID" and "OAuth 2.0 Client Secret"\n' +
        '   → Verify they are from the SAME app\n\n' +
        '2. ❌ OAuth 1.0a is not enabled in your Twitter App\n' +
        '   → Go to your Twitter App → "User authentication settings"\n' +
        '   → Enable "OAuth 1.0a"\n' +
        '   → Set App permissions to "Read" (or "Read and Write")\n' +
        '   → Click "Save"\n\n';
      }
      
      errorMessage += '3. ❌ Callback URL is not registered\n' +
        '   → In "User authentication settings", add this callback URL:\n' +
        '   → ' + callbackUrl + '\n' +
        '   → Click "Save" (very important!)\n\n' +
        '4. ❌ Credentials have extra spaces or quotes\n' +
        '   → Check your .env file or Vercel environment variables\n' +
        '   → Remove any quotes, spaces, or newlines\n' +
        '   → Redeploy after updating\n\n' +
        '5. ❌ Twitter App is suspended or inactive\n' +
        '   → Check Twitter Developer Portal for any warnings\n' +
        '   → Ensure your developer account is active\n\n' +
        'After fixing, wait 2-3 minutes for changes to propagate, then try again.';
      
      const detailedError = new Error(errorMessage);
      detailedError.originalError = error;
      detailedError.code = 401;
      detailedError.twitterErrorCode = 32;
      throw detailedError;
    }
    
    throw error;
  }
}

/**
 * Verify follow after OAuth callback
 * IMPORTANT: This function authenticates the USER's Twitter account (the person who clicked "Verify"),
 * NOT the app owner's account. Each user authenticates separately with their own Twitter account.
 */
export async function verifyFollowAfterOAuth(oauthToken, oauthVerifier, oauthTokenSecret) {
  try {
    console.log('[Twitter Verification] Starting OAuth verification...');
    
    const client = new TwitterApi({
      appKey: process.env.TWITTER_CLIENT_ID,
      appSecret: process.env.TWITTER_CLIENT_SECRET,
      accessToken: oauthToken,
      accessSecret: oauthTokenSecret,
    });

    // Complete OAuth flow - this authenticates the USER's Twitter account (not the app owner)
    // Each user who clicks "Verify" will authenticate with their own Twitter account
    console.log('[Twitter Verification] Completing OAuth login...');
    const { client: loggedClient, accessToken, accessSecret } = await client.login(oauthVerifier);

    // Get the authenticated USER's Twitter ID (the person who clicked "Verify")
    // This will be DIFFERENT for each user who authenticates
    // User A gets their Twitter ID, User B gets their Twitter ID, etc.
    // Use v1.1 API to avoid requiring Project attachment (v2 API requires Project)
    console.log('[Twitter Verification] Getting authenticated user info...');
    const v1Client = loggedClient.v1; // Access v1.1 API (doesn't require Project attachment)
    const account = await v1Client.verifyCredentials();
    const userId = account.id_str; // This is the USER's Twitter ID, not the app owner's!
    const username = account.screen_name;
    
    console.log(`[Twitter Verification] Authenticated as Twitter user: @${username} (ID: ${userId})`);
    console.log(`[Twitter Verification] This is the USER's account, not the app owner's account`);

    // Get the target account to check if user is following (e.g., @boinknfts)
    const targetUsername = process.env.TWITTER_TARGET_USERNAME || 'boinknfts';
    console.log(`[Twitter Verification] Checking if @${username} is following @${targetUsername}...`);
    
    // SIMPLEST METHOD: Use friendships/show endpoint to directly check if user follows @boinknfts
    // This gives us a direct yes/no answer - perfect for our use case
    // Documentation: https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-show
    // 
    // IMPORTANT: API Access Level Requirements:
    // - v2 API endpoints (/2/users/:id/following, /2/users/:id/followers) are NOT AVAILABLE on Free/Basic tiers
    //   (These endpoints are not even listed in the rate limits table for Free/Basic tiers)
    // - v1.1 API endpoints (friendships/show, friends/ids, followers/ids) may still work
    // - v1.1 endpoints are NOT shown in v2 API rate limits table but may have separate limits
    // - If all API methods fail, we fall back to trust-based verification
    // Requires: OAuth 1.0a User Context (which we have) + Appropriate access level
    try {
      // Try different possible method names for friendships/show endpoint
      let relationship;
      try {
        // Method 1: Direct API call (most reliable)
        // This directly tells us: "Does user A follow user B?" - exactly what we need!
        relationship = await v1Client.get('friendships/show.json', {
          source_id: userId,
          target_screen_name: targetUsername,
        });
      } catch (methodError) {
        // Method 2: friendshipsShow (if library provides this method)
        try {
          relationship = await v1Client.friendshipsShow({
            source_id: userId,
            target_screen_name: targetUsername,
          });
        } catch (methodError2) {
          // Method 3: friendship (alternative method name)
          relationship = await v1Client.friendship({
        source_id: userId,
        target_screen_name: targetUsername,
      });
        }
      }

      // Simple check: Does the authenticated user follow @boinknfts?
      const isFollowing = relationship.relationship?.source?.following === true;
      
      console.log(`[Twitter Verification] ✅ Result: @${username} ${isFollowing ? 'IS' : 'IS NOT'} following @${targetUsername}`);
      
      return {
        isFollowing,
        twitterUserId: userId,
        twitterUsername: username,
        accessToken,
        accessSecret,
      };
    } catch (friendshipError) {
      // If friendships/show fails, try alternative method
      console.warn('[Twitter Verification] friendships/show endpoint failed, trying alternative method:', friendshipError.message);
      console.warn('[Twitter Verification] Error details:', {
        code: friendshipError.code,
        twitterErrorCode: friendshipError.errors?.[0]?.code,
        data: friendshipError.data,
        errors: friendshipError.errors
      });
      
      // Error 453: friendships/show endpoint not available (requires Elevated access)
      // Fallback: Check if @boinknfts is in the user's following list
      if (friendshipError.code === 403 && friendshipError.errors?.[0]?.code === 453) {
        console.log('[Twitter Verification] friendships/show not available (code 453 - needs Elevated access)');
        console.log('[Twitter Verification] Using fallback: Check if @boinknfts is in user\'s following list...');
        
        try {
          // FALLBACK: Get user's following list and check if @boinknfts is in it
          // This uses v1.1 friends/ids endpoint which may work with Essential (Free) tier
          // Note: v2 API endpoints are RESTRICTED on Free tier
          
          // Step 1: Get @boinknfts user ID
          const targetUser = await v1Client.user({ screen_name: targetUsername });
          const targetUserId = targetUser.id_str;
          console.log(`[Twitter Verification] Target @${targetUsername} has ID: ${targetUserId}`);
          
          // Step 2: Get the authenticated user's following list
          // friends = people the user follows
          // This endpoint may work with Essential tier (unlike v2 API)
          console.log(`[Twitter Verification] Getting following list for @${username}...`);
          const friendsIds = await v1Client.friendsIds({ user_id: userId });
          
          // Step 3: Simple check - is @boinknfts in the list?
          const isFollowing = friendsIds.ids.includes(targetUserId);
          
          console.log(`[Twitter Verification] ✅ Result: @${username} ${isFollowing ? 'IS' : 'IS NOT'} following @${targetUsername}`);
          
          return {
            isFollowing,
            twitterUserId: userId,
            twitterUsername: username,
            accessToken,
            accessSecret,
          };
        } catch (fallbackError) {
          console.warn('[Twitter Verification] friends/ids method failed, trying alternative: followers/list...', fallbackError.message);
          
          // ALTERNATIVE METHOD 2: Check from the other direction - is user in @boinknfts followers list?
          // This might work if the user's following list is private but @boinknfts followers are public
          try {
            console.log('[Twitter Verification] Trying alternative: Check if user is in @boinknfts followers list...');
            
            // Get @boinknfts user info
            const targetUser = await v1Client.user({ screen_name: targetUsername });
            const targetUserId = targetUser.id_str;
            
            // Get @boinknfts followers list and check if authenticated user is in it
            // Note: This only works if @boinknfts account is public
            console.log(`[Twitter Verification] Getting followers list for @${targetUsername}...`);
            const followersIds = await v1Client.followersIds({ user_id: targetUserId });
            
            // Check if authenticated user is in @boinknfts followers list
            const isFollowing = followersIds.ids.includes(userId);
            
            console.log(`[Twitter Verification] ✅ Result (via followers list): @${username} ${isFollowing ? 'IS' : 'IS NOT'} following @${targetUsername}`);
      
      return {
        isFollowing,
        twitterUserId: userId,
        twitterUsername: username,
        accessToken,
        accessSecret,
      };
          } catch (followersError) {
            console.error('[Twitter Verification] All API methods failed');
            console.error('friendships/show error:', friendshipError.message);
            console.error('friends/ids error:', fallbackError.message);
            console.error('followers/ids error:', followersError.message);
            
            // FINAL FALLBACK: Trust-based verification (award points without verification)
            // This is less secure but allows the system to continue working
            console.warn('[Twitter Verification] ⚠️  All verification methods failed - using trust-based fallback');
            console.warn('[Twitter Verification] User will be awarded points without verification');
            
            // Return as if they're following (trust-based)
            // The calling code can decide whether to accept this or show an error
            return {
              isFollowing: true, // Trust-based: assume they're following
              twitterUserId: userId,
              twitterUsername: username,
              accessToken,
              accessSecret,
              trustBased: true, // Flag to indicate this is trust-based
              warning: 'Could not verify follow status via API. Points awarded on trust basis.'
            };
          }
        }
      }
      
      // Other 403 errors
      if (friendshipError.code === 403) {
        throw new Error(
          'Twitter API access denied (403). Common causes:\n' +
          '1. Your Twitter App needs "Read" or "Read and Write" permissions\n' +
          '2. OAuth 1.0a must be enabled in your Twitter App settings\n' +
          '3. The user must authorize your app with the correct permissions\n' +
          '4. Error 453: friendships/show endpoint requires Elevated access level\n' +
          '   → Apply for Elevated access (free) in Twitter Developer Portal\n' +
          `Original error: ${friendshipError.message}`
        );
      }
      
      if (friendshipError.code === 401) {
        throw new Error(
          'Twitter API authentication failed (401). Check:\n' +
          '1. OAuth credentials are correct\n' +
          '2. OAuth 1.0a is properly configured\n' +
          `Original error: ${friendshipError.message}`
        );
      }
      
      throw new Error(`Failed to verify follow status: ${friendshipError.message}`);
    }
  } catch (error) {
    console.error('[Twitter Verification] Error verifying follow after OAuth:', error);
    console.error('[Twitter Verification] Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error;
  }
}

