import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import referralRegistryABI from "../ReferralRegistry.json";
import type { EthereumProvider } from "@/types/wallet";
import { awardReferralPoints, awardTwitterFollowPoints, getTwitterOAuthUrl, getUser } from "@/lib/api";

interface ReferralProps {
  connectedWallet: string | null;
  connectedWalletName?: string | null;
  walletProviders: Record<string, EthereumProvider>;
  pendingRefCode?: string | null;
  onRefCodeUsed?: () => void;
}

export const Referral = ({ 
  connectedWallet,
  connectedWalletName,
  walletProviders,
  pendingRefCode,
  onRefCodeUsed 
}: ReferralProps) => {
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  
  // Referral code state
  const [myCode, setMyCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string>("");
  const [hasUsedCode, setHasUsedCode] = useState<boolean>(false);
  const [referrer, setReferrer] = useState<string | null>(null);
  
  // Stats state
  const [totalReferrals, setTotalReferrals] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [twitterFollowed, setTwitterFollowed] = useState<boolean>(false);
  const [twitterUserId, setTwitterUserId] = useState<string | null>(null);
  
  // Loading states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [isClaimingTwitter, setIsClaimingTwitter] = useState<boolean>(false);
  
  const { toast } = useToast();

  const REFERRAL_REGISTRY_ADDRESS = import.meta.env.VITE_REFERRAL_REGISTORY_ADDRESS || "0x6C02bb7536d71a69F3d38E448422C80445D26b0d";
  const EXPECTED_CHAIN_ID = import.meta.env.VITE_CHAIN_ID || "763373";

  // Check for Twitter OAuth callback and refresh user data
  useEffect(() => {
    if (!connectedWallet) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const twitterSuccess = urlParams.get('twitter_success');
    const twitterError = urlParams.get('twitter_error');
    
    if (twitterSuccess === 'true' || twitterError) {
      // Refresh user data after OAuth callback
      const refreshUserData = async () => {
        try {
          const userData = await getUser(connectedWallet);
          if (userData) {
            setUserPoints(userData.points);
            setTwitterFollowed(userData.twitterFollowed);
            setTwitterUserId(userData.twitterUserId || null);
          }
        } catch (error) {
          console.error('Error refreshing user data after OAuth:', error);
        }
      };
      
      refreshUserData();
    }
  }, [connectedWallet]);

  // Initialize contract and check user status
  useEffect(() => {
    if (!connectedWallet) {
      setIsLoading(false);
      return;
    }

    const init = async () => {
      try {
        // Use wallet name to get provider, or try to find it by checking window.ethereum
        const walletName = connectedWalletName || "MetaMask"; // Default to MetaMask if not specified
        const ethereumProvider = walletProviders[walletName] || (window as any).ethereum;
        
        if (!ethereumProvider) {
          setIsLoading(false);
          return;
        }

        const browserProvider = new ethers.BrowserProvider(ethereumProvider);
        setProvider(browserProvider);

        const network = await browserProvider.getNetwork();
        const currentChainId = network.chainId.toString();

        if (currentChainId !== EXPECTED_CHAIN_ID) {
          toast({
            variant: "destructive",
            title: "Wrong Network",
            description: `Please switch to the correct network (Chain ID: ${EXPECTED_CHAIN_ID})`,
          });
          setIsLoading(false);
          return;
        }

        // Use connectedWallet directly as the address (it's already the address)
        const userAddress = connectedWallet.toLowerCase();
        setAddress(userAddress);
        
        // Get signer for the connected address
        // Use getSigner() without parameters to get the default signer (currently selected account)
        const userSigner = await browserProvider.getSigner();
        setSigner(userSigner);
        
        // Verify the signer address matches connectedWallet
        const signerAddress = await userSigner.getAddress();
        if (signerAddress.toLowerCase() !== userAddress) {
          console.warn(`Signer address (${signerAddress}) doesn't match connected wallet (${userAddress})`);
          // Still continue, but log the warning
        }

        const referralContract = new ethers.Contract(
          REFERRAL_REGISTRY_ADDRESS,
          referralRegistryABI,
          browserProvider
        );
        setContract(referralContract);

        // Check if user has used a referral code
        const used = await referralContract.hasUsedCode(userAddress);
        setHasUsedCode(used);

        // If user has used a code, get their referrer
        if (used) {
          const referrerAddress = await referralContract.referrerOf(userAddress);
          if (referrerAddress && referrerAddress !== ethers.ZeroAddress) {
            setReferrer(referrerAddress);
          }
        }

        // Get user's referral code and stats
        const userCode = await referralContract.codeOfReferrer(userAddress);
        if (userCode && userCode !== ethers.ZeroHash) {
          setMyCode(userCode);

          // Get stats
          const [code, totalRefs, active] = await referralContract.getReferrerStats(userAddress);
          if (code && code !== ethers.ZeroHash) {
            setTotalReferrals(Number(totalRefs));
            setIsActive(active);
          }
        }

        // Load user points
        try {
          const userData = await getUser(userAddress);
          if (userData) {
            setUserPoints(userData.points);
            setTwitterFollowed(userData.twitterFollowed);
            setTwitterUserId(userData.twitterUserId || null);
          }
        } catch (error) {
          console.error('Error loading user points:', error);
        }
      } catch (error: any) {
        console.error("Referral initialization error:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error?.message || "Failed to initialize referral system",
        });
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [connectedWallet, connectedWalletName, walletProviders, REFERRAL_REGISTRY_ADDRESS, EXPECTED_CHAIN_ID, toast]);

  // Extract referral code from URL or validate code format
  const extractCode = (input: string): string | null => {
    // If it's a full URL, try to extract the refCode parameter
    if (input.includes('refCode=')) {
      try {
        const url = new URL(input);
        const code = url.searchParams.get('refCode');
        if (code) return code;
      } catch (e) {
        // If URL parsing fails, try regex extraction
        const match = input.match(/refCode=([0-9a-fA-Fx]+)/i);
        if (match && match[1]) {
          // Ensure it starts with 0x
          return match[1].startsWith('0x') ? match[1] : `0x${match[1]}`;
        }
      }
    }
    // If it's already a code, return it
    if (/^0x[0-9a-fA-F]{64}$/.test(input.trim())) {
      return input.trim();
    }
    return null;
  };

  // Validate code format
  const isValidCode = (code: string): boolean => {
    return /^0x[0-9a-fA-F]{64}$/.test(code);
  };

  // Check if code is valid on-chain
  const isCodeValid = async (code: string): Promise<boolean> => {
    if (!contract) return false;
    try {
      const codeData = await contract.codes(code);
      return codeData && codeData.active;
    } catch (error) {
      console.error("Error checking code validity:", error);
      return false;
    }
  };

  // Generate referral code
  const handleGenerateCode = async () => {
    // Check if wallet is connected first
    if (!connectedWallet) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please connect your wallet first",
      });
      return;
    }

    // Check if still loading
    if (isLoading) {
      toast({
        variant: "destructive",
        title: "Please Wait",
        description: "Initializing referral system...",
      });
      return;
    }

    // Check if contract/signer/address are initialized
    if (!contract || !signer || !address) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Wallet connection not ready. Please try again in a moment.",
      });
      console.error("Referral initialization incomplete:", { contract: !!contract, signer: !!signer, address, connectedWallet });
      return;
    }

    // Check if user already has a code
    try {
      const existingCode = await contract.codeOfReferrer(address);
      if (existingCode && existingCode !== ethers.ZeroHash) {
        toast({
          variant: "destructive",
          title: "Already Have Code",
          description: "You already have a referral code. Check the 'Your Progress' tab to see it.",
        });
        setMyCode(existingCode);
        // Refresh stats
        const [code, totalRefs, active] = await contract.getReferrerStats(address);
        if (code && code !== ethers.ZeroHash) {
          setTotalReferrals(Number(totalRefs));
          setIsActive(active);
        }
        return;
      }
    } catch (error) {
      console.error("Error checking existing code:", error);
    }

    setIsGenerating(true);
    try {
      const contractWithSigner = contract.connect(signer) as any;
      const salt = ethers.keccak256(
        ethers.toUtf8Bytes(Date.now().toString() + Math.random().toString())
      );

      const tx = await contractWithSigner.createReferralCode(salt);
      toast({
        title: "Transaction Sent",
        description: "Waiting for confirmation...",
      });

      // OPTIMIZED: Wait for only 1 confirmation (faster)
      const receipt = await tx.wait(1);
      console.log("Transaction confirmed in block:", receipt.blockNumber);

      // Try to get the code from the transaction receipt logs first (most reliable)
      let newCode = ethers.ZeroHash;
      
      try {
        // Parse the ReferralCodeCreated event from the transaction receipt
        if (receipt.logs && receipt.logs.length > 0) {
          for (const log of receipt.logs) {
            try {
              const parsed = contract.interface.parseLog(log);
              if (parsed && parsed.name === "ReferralCodeCreated") {
                // Verify this event is for our address
                if (parsed.args && parsed.args.referrer && 
                    parsed.args.referrer.toLowerCase() === address!.toLowerCase() &&
                    parsed.args.code) {
                  newCode = parsed.args.code;
                  console.log("Got referral code from transaction receipt event:", newCode);
                  break;
                }
              }
            } catch (parseError) {
              // Not the event we're looking for, continue
              continue;
            }
          }
        }
      } catch (eventError) {
        console.warn("Error parsing events from receipt:", eventError);
      }

      // If we didn't get it from the receipt, try querying the contract
      if (newCode === ethers.ZeroHash) {
        // Wait a moment for RPC to index the new state
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Poll for the new code with retries (RPC might not have indexed yet)
        let attempts = 0;
        const maxAttempts = 10;
        
        while (newCode === ethers.ZeroHash && attempts < maxAttempts) {
          try {
            newCode = await contract.codeOfReferrer(address!);
            if (newCode !== ethers.ZeroHash) {
              console.log("Referral code fetched from contract:", newCode);
              break;
            }
          } catch (error) {
            console.warn("Error fetching code, retrying...", error);
          }
          
          attempts++;
          if (newCode === ethers.ZeroHash && attempts < maxAttempts) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        // Last resort: query events from the block
        if (newCode === ethers.ZeroHash) {
          try {
            const filter = contract.filters.ReferralCodeCreated(address);
            const events = await contract.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
            if (events.length > 0) {
              const event = events[0];
              const parsed = contract.interface.parseLog(event);
              if (parsed && parsed.args && parsed.args.code) {
                newCode = parsed.args.code;
                console.log("Got code from block events:", newCode);
              }
            }
          } catch (eventError) {
            console.error("Error fetching code from block events:", eventError);
          }
        }
      }

      if (newCode && newCode !== ethers.ZeroHash) {
        setMyCode(newCode);
        setIsActive(true);
        setTotalReferrals(0);

        toast({
          title: "Success",
          description: "Referral code generated successfully!",
        });
      } else {
        // If we still don't have the code, show a warning but don't fail
        console.warn("Could not fetch referral code immediately. It should appear after a page refresh.");
        toast({
          title: "Transaction Confirmed",
          description: "Your referral code is being generated. Please refresh the page in a moment to see it.",
          variant: "default",
        });
      }
    } catch (error: any) {
      console.error("Error generating code:", error);
      
      // Parse error message for better user feedback
      let errorMessage = "Failed to generate referral code";
      
      if (error?.message) {
        if (error.message.includes("revert") || error.message.includes("CALL_EXCEPTION")) {
          // Check if user already has a code (common restriction)
          try {
            const existingCode = await contract.codeOfReferrer(address!);
            if (existingCode && existingCode !== ethers.ZeroHash) {
              errorMessage = "You already have a referral code. Check 'Your Progress' tab.";
              setMyCode(existingCode);
            } else if (hasUsedCode) {
              errorMessage = "You cannot generate a referral code after using someone else's code. This is a contract restriction.";
            } else {
              errorMessage = "Contract rejected the transaction. You may already have a code or there's a restriction.";
            }
          } catch (checkError) {
            errorMessage = "Transaction failed. The contract may prevent creating a code if you've already used one.";
          }
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Use referral code
  const handleUseCode = async (code: string) => {
    // Check if wallet is connected first
    if (!connectedWallet) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please connect your wallet first",
      });
      return;
    }

    // Check if still loading
    if (isLoading) {
      toast({
        variant: "destructive",
        title: "Please Wait",
        description: "Initializing referral system...",
      });
      return;
    }

    // Check if contract/signer are initialized
    if (!contract || !signer) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Wallet connection not ready. Please try again in a moment.",
      });
      console.error("Referral initialization incomplete:", { contract: !!contract, signer: !!signer, connectedWallet });
      return;
    }

    // Extract code from URL if needed
    const extractedCode = extractCode(code);
    if (!extractedCode || !isValidCode(extractedCode)) {
      toast({
        variant: "destructive",
        title: "Invalid Code",
        description: "Please enter a valid referral code (0x followed by 64 hex characters) or a URL containing refCode",
      });
      return;
    }

    // Use the extracted code
    const finalCode = extractedCode;

    setIsSubmitting(true);
    try {
      // Validate code on-chain
      const valid = await isCodeValid(finalCode);
      if (!valid) {
        toast({
          variant: "destructive",
          title: "Invalid Code",
          description: "This referral code is invalid or inactive",
        });
        setIsSubmitting(false);
        return;
      }

      const contractWithSigner = contract.connect(signer) as any;
      const tx = await contractWithSigner.useReferralCode(finalCode);
      toast({
        title: "Transaction Sent",
        description: "Waiting for confirmation...",
      });

      // OPTIMIZED: Wait for only 1 confirmation (faster)
      await tx.wait(1);

      setHasUsedCode(true);
      setManualCode("");
      
      // Get referrer address
      const referrerAddress = await contract.referrerOf(address!);
      if (referrerAddress && referrerAddress !== ethers.ZeroAddress) {
        setReferrer(referrerAddress);
      }

      // Award points to referrer (not the user using the code)
      if (address && referrerAddress && referrerAddress !== ethers.ZeroAddress) {
        try {
          const pointsResult = await awardReferralPoints(address, referrerAddress);
          if (pointsResult.success && pointsResult.points !== undefined) {
            // Points were awarded to the referrer, not the current user
            toast({
              title: "🎉 Referral Applied!",
              description: `The referrer earned ${pointsResult.pointsAwarded} points for your signup!`,
            });
          } else if (pointsResult.message) {
            // Points already awarded
            toast({
              title: "Referral Applied",
              description: pointsResult.message,
            });
          }
        } catch (error) {
          console.error('Error awarding referral points:', error);
          // Don't show error toast, as referral was successful
        }
      }

      // Clear pending ref code from localStorage
      localStorage.removeItem("coinflip_refCode");
      if (onRefCodeUsed) {
        onRefCodeUsed();
      }

      toast({
        title: "Success",
        description: "Referral code applied successfully!",
      });
    } catch (error: any) {
      console.error("Error using code:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to use referral code",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = async () => {
    if (!myCode) return;
    try {
      await navigator.clipboard.writeText(myCode);
      toast({
        title: "Copied!",
        description: "Referral code copied to clipboard",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy to clipboard",
      });
    }
  };

  // Handle Twitter follow claim
  const handleTwitterFollowClaim = async () => {
    if (!address) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please connect your wallet first",
      });
      return;
    }

    setIsClaimingTwitter(true);
    try {
      // First, try to get OAuth URL (if Twitter API is configured)
      const oauthResult = await getTwitterOAuthUrl(address);
      
      if (oauthResult.oauthUrl) {
        // Twitter OAuth is configured - redirect to Twitter
        window.location.href = oauthResult.oauthUrl;
        return;
      }

      // If OAuth is not configured, fall back to trust-based system
      if (oauthResult.trustBased) {
        // Trust-based system - award points directly
        const pointsResult = await awardTwitterFollowPoints(address);
        
        if (pointsResult.success && pointsResult.points !== undefined) {
          setUserPoints(pointsResult.points);
          setTwitterFollowed(true);
          toast({
            title: "🎉 Points Awarded!",
            description: `You earned ${pointsResult.pointsAwarded} points for following on Twitter! Total: ${pointsResult.points} points`,
          });
        } else if (pointsResult.message) {
          // If it says OAuth is required, show a clearer message
          if (pointsResult.requiresOAuth || pointsResult.message.includes('OAuth')) {
            toast({
              variant: "destructive",
              title: "OAuth Required",
              description: "Please click 'Verify & Claim 50 Points' to authenticate with Twitter.",
            });
          } else {
            toast({
              title: "Already Claimed",
              description: pointsResult.message,
            });
          }
        }
        return;
      }

      // If we get here, OAuth is configured but something went wrong
      if (oauthResult.requiresOAuth) {
        toast({
          variant: "destructive",
          title: "OAuth Required",
          description: "Please use the 'Verify with Twitter' button to verify your follow.",
        });
        return;
      }
    } catch (error) {
      console.error('Error claiming Twitter follow points:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to claim points",
      });
    } finally {
      setIsClaimingTwitter(false);
    }
  };


  if (!connectedWallet) {
    return (
      <div className="text-center space-y-2 sm:space-y-3">
        <h2 className="text-base sm:text-lg font-bold font-military text-gradient-emerald">
          🎁 Referral System 🎁
        </h2>
        <p className="text-xs sm:text-sm font-cyber text-gradient-red">
          Connect your wallet to use the referral system!
        </p>
        <div className="win98-border p-2 sm:p-3 bg-secondary">
          <p className="text-center text-xs sm:text-sm font-pixel">Connect Wallet Required</p>
          <p className="text-center text-xs mt-1 sm:mt-2 font-retro">
            Click the wallet icon in the taskbar to connect
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center space-y-2">
        <p className="text-xs sm:text-sm font-retro">Loading referral data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-3 pb-2">
      <h2 className="text-base sm:text-lg font-bold font-military text-gradient-emerald">
        🎁 Referral System 🎁
      </h2>

      {/* Points Display */}
      {connectedWallet && (
        <div className="p-3 sm:p-2 bg-gradient-to-r from-yellow-100 to-yellow-50 win98-border">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-sm font-pixel text-gray-700">💰 Points:</span>
            <span className="text-lg sm:text-lg font-bold font-military text-gradient-yellow">{userPoints}</span>
          </div>
        </div>
      )}

      <Tabs defaultValue="code" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto sm:h-8 gap-2 sm:gap-1 p-1.5 sm:p-1">
          <TabsTrigger 
            value="code" 
            className="font-pixel text-sm sm:text-sm px-3 sm:px-3 py-3 sm:py-1.5 touch-manipulation min-h-[48px] sm:min-h-0 whitespace-normal sm:whitespace-nowrap text-center leading-tight"
          >
            Referral Code
          </TabsTrigger>
          <TabsTrigger 
            value="progress" 
            className="font-pixel text-sm sm:text-sm px-3 sm:px-3 py-3 sm:py-1.5 touch-manipulation min-h-[48px] sm:min-h-0 whitespace-normal sm:whitespace-nowrap text-center leading-tight"
          >
            Your Progress
          </TabsTrigger>
        </TabsList>

        {/* Referral Code Tab */}
        <TabsContent value="code" className="space-y-3 sm:space-y-3 mt-3 sm:mt-2">
          {/* Show if user already used a code */}
          {hasUsedCode && (
            <div className="win98-border-inset p-2 sm:p-3 bg-green-100">
              <p className="text-xs sm:text-sm font-retro text-green-800">
                ✓ You have already used a referral code
              </p>
              {referrer && (
                <p className="text-xs font-pixel text-green-700 mt-1">
                  Referred by: <span className="font-mono">{referrer.slice(0, 6)}...{referrer.slice(-4)}</span>
                </p>
              )}
              <p className="text-xs font-retro text-green-700 mt-1">
                💡 You can still generate your own code below to refer others!
              </p>
            </div>
          )}

          {/* Show pending ref code from URL */}
          {!hasUsedCode && pendingRefCode && (
            <div className="win98-border-inset p-2 sm:p-3 bg-blue-100">
              <p className="text-xs sm:text-sm font-retro text-blue-800 mb-2">
                📎 Referral code detected from link:
              </p>
              <code className="text-[10px] sm:text-xs font-mono bg-white p-2 sm:p-1.5 block mb-2 break-all leading-relaxed">
                {pendingRefCode}
              </code>
              <Button
                onClick={() => handleUseCode(pendingRefCode)}
                disabled={isSubmitting}
                className="w-full font-pixel text-xs sm:text-sm h-11 sm:h-8 touch-manipulation"
              >
                {isSubmitting ? "Processing..." : "Use This Code"}
              </Button>
            </div>
          )}

          {/* Manual code input */}
          {!hasUsedCode && (
            <div className="win98-border-inset p-3 sm:p-3 space-y-3 sm:space-y-2">
              <h3 className="text-sm sm:text-sm font-bold font-military text-gradient-blue">
                Do you have a referral code?
              </h3>
              <div className="space-y-3 sm:space-y-2">
                <Input
                  value={manualCode}
                  onChange={(e) => {
                    const input = e.target.value;
                    // Auto-extract code from URL if pasted
                    const extracted = extractCode(input);
                    if (extracted && extracted !== input) {
                      // If we extracted a code from URL, show only the code
                      setManualCode(extracted);
                    } else {
                      setManualCode(input);
                    }
                  }}
                  onPaste={(e) => {
                    // Handle paste event to extract code from URL
                    const pastedText = e.clipboardData.getData('text');
                    const extracted = extractCode(pastedText);
                    if (extracted) {
                      e.preventDefault();
                      setManualCode(extracted);
                    }
                  }}
                  placeholder="Paste referral code or URL"
                  className="font-mono text-sm sm:text-sm h-12 sm:h-9 touch-manipulation"
                />
                <Button
                  onClick={() => handleUseCode(manualCode)}
                  disabled={isSubmitting || !manualCode.trim()}
                  className="w-full font-pixel text-sm sm:text-sm h-12 sm:h-9 touch-manipulation"
                >
                  {isSubmitting ? "Processing..." : "Add Referral Code"}
                </Button>
              </div>
            </div>
          )}

          {/* Twitter Follow Section */}
          <div className="win98-border-inset p-3 sm:p-3 space-y-3 sm:space-y-2 bg-blue-50">
            <h3 className="text-sm sm:text-sm font-bold font-military text-gradient-blue">
              🐦 Follow on Twitter
            </h3>
            <p className="text-xs sm:text-xs font-retro text-muted-foreground mb-2 leading-relaxed">
              Follow us on Twitter and earn 50 points!
            </p>
            {twitterFollowed && twitterUserId ? (
              <div className="p-3 sm:p-2 bg-green-100 win98-border">
                <p className="text-xs sm:text-xs font-retro text-green-800">
                  ✓ You've already claimed Twitter follow points!
                </p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-2">
                <Button
                  onClick={() => window.open('https://x.com/boinknfts', '_blank')}
                  className="w-full font-pixel text-sm sm:text-sm h-12 sm:h-9 touch-manipulation bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Open Twitter
                </Button>
                <Button
                  onClick={handleTwitterFollowClaim}
                  disabled={isClaimingTwitter}
                  className="w-full font-pixel text-sm sm:text-sm h-12 sm:h-9 touch-manipulation"
                >
                  {isClaimingTwitter ? "Verifying..." : "Verify & Claim 50 Points"}
                </Button>
              </div>
            )}
          </div>

          {/* Generate code section */}
          <div className="win98-border-inset p-3 sm:p-3 space-y-3 sm:space-y-2">
            <h3 className="text-sm sm:text-sm font-bold font-military text-gradient-purple">
              Generate Your Referral Code
            </h3>
            <p className="text-xs sm:text-xs font-retro text-muted-foreground mb-2 sm:mb-1 leading-relaxed">
              Create your own referral code to share with others and track your referrals
            </p>
          
            {myCode ? (
              <div className="space-y-3 sm:space-y-2">
                <div className="win98-border p-3 sm:p-3 bg-secondary">
                  <p className="text-sm sm:text-sm font-retro text-muted-foreground mb-2 sm:mb-1">Your Referral Code:</p>
                  <code className="text-xs sm:text-xs text-black font-mono break-all block bg-white p-3 sm:p-2 leading-relaxed">
                    {myCode}
                  </code>
                </div>
                <Button
                  onClick={handleCopyCode}
                  variant="outline"
                  className="w-full font-pixel text-sm sm:text-sm h-12 sm:h-9 touch-manipulation"
                >
                  Copy Code
                </Button>
                {!isActive && (
                  <p className="text-sm sm:text-xs font-retro text-red-600">
                    ⚠️ Your referral code is inactive
                  </p>
                )}
              </div>
            ) : (
              <Button
                onClick={handleGenerateCode}
                disabled={isGenerating}
                className="w-full font-pixel text-sm sm:text-sm h-12 sm:h-9 touch-manipulation"
              >
                {isGenerating ? "Generating..." : "Generate Referral Code"}
              </Button>
            )}
          </div>
        </TabsContent>

        {/* Your Progress Tab */}
        <TabsContent value="progress" className="space-y-3 sm:space-y-3 mt-3 sm:mt-2">
          {myCode ? (
            <div className="space-y-2 sm:space-y-3">
              <div className="win98-border-inset p-2 sm:p-3 bg-secondary">
                <h3 className="text-xs sm:text-sm font-bold font-military text-gradient-blue mb-2">
                  Your Referral Statistics
                </h3>
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm font-retro text-black">Total Referrals:</span>
                    <span className="text-base sm:text-lg font-bold font-pixel text-gradient-emerald">
                      {totalReferrals}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm font-retro text-black">Status:</span>
                    <span className={`text-xs sm:text-sm font-pixel ${isActive ? 'text-green-600' : 'text-red-600'}`}>
                      {isActive ? "✓ Active" : "✗ Inactive"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm font-retro text-black">Your Code:</span>
                    <code className="text-xs font-mono text-red-600">
                      {myCode.slice(0, 10)}...{myCode.slice(-6)}
                    </code>
                  </div>
                </div>
              </div>

              <div className="win98-border-inset p-2 sm:p-3">
                <p className="text-xs font-retro text-muted-foreground">
                  Share your referral link to earn rewards when others use your code!
                </p>
              </div>
            </div>
          ) : (
            <div className="win98-border-inset p-2 sm:p-3 bg-secondary text-center">
              <p className="text-xs sm:text-sm font-retro text-muted-foreground">
                Generate a referral code first to see your progress
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

