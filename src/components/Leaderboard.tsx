import { useState, useEffect } from "react";
import { ethers } from "ethers";
import coinFlipArtifact from "../coinFlip.json";
import referralRegistryArtifact from "../ReferralRegistry.json";
import { getLeaderboard } from "../lib/api";

// Type assertion for ABI - the JSON file is an array of ABI items
const coinFlipABI = coinFlipArtifact as any;
const referralRegistryABI = referralRegistryArtifact as any;

interface LeaderboardProps {
  connectedWallet: string | null;
  connectedWalletName?: string | null;
  walletProviders: Record<string, any>;
}

interface PlayerStats {
  address: string;
  plays: number;
  wins: number;
  wagered: bigint;
  paidOut: bigint;
  winRate: number;
}

interface ReferralStats {
  address: string;
  totalReferrals: number;
  referralPoints: number; // totalReferrals * 20
  code: string;
  active: boolean;
}

interface PointsStats {
  address: string;
  points: number;
  flips: number;
}

export const Leaderboard = ({ connectedWallet, connectedWalletName, walletProviders }: LeaderboardProps) => {
  const [activeTab, setActiveTab] = useState<"onchain" | "referrals" | "points">("onchain");
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [referrals, setReferrals] = useState<ReferralStats[]>([]);
  const [points, setPoints] = useState<PointsStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"wins" | "plays" | "winRate">("wins");
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [referralContract, setReferralContract] = useState<ethers.Contract | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  const CONTRACT_ADDRESS = import.meta.env.VITE_COINFLIP_CONTRACT_ADDRESS || "";
  const REFERRAL_REGISTRY_ADDRESS = import.meta.env.VITE_REFERRAL_REGISTORY_ADDRESS || "";
  const EXPECTED_CHAIN_ID = import.meta.env.VITE_CHAIN_ID || "763373";

  const loadPointsLeaderboard = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("📊 Loading points leaderboard from database...");

      // Fetch points leaderboard from database
      const leaderboardData = await getLeaderboard(100); // Get top 100 users
      
      const pointsStats: PointsStats[] = leaderboardData
        .filter((user) => user.points > 0) // Only show users with points
        .map((user) => ({
          address: user.walletAddress,
          points: user.points,
          flips: user.flips || 0,
        }));

      // Sort by points (descending) - already sorted by backend, but ensure it
      const sorted = [...pointsStats].sort((a, b) => b.points - a.points);

      console.log(`✅ Loaded ${sorted.length} users with points from database`);
      setPoints(sorted);
    } catch (e: any) {
      console.error("❌ Error loading points leaderboard:", e);
      setError(e?.message || "Failed to load points leaderboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Points leaderboard doesn't require wallet connection
    if (activeTab === "points") {
      loadPointsLeaderboard();
      return;
    }

    if (connectedWallet && CONTRACT_ADDRESS) {
      // Get provider by wallet name, or fallback to window.ethereum
      const walletName = connectedWalletName || "MetaMask"; // Default to MetaMask if not specified
      const ethereumProvider = walletProviders[walletName] || (window as any).ethereum;
      
      if (!ethereumProvider || typeof ethereumProvider.request !== "function") {
        console.error("No wallet provider available");
        setError("Wallet provider not available");
        setLoading(false);
        return;
      }
      
      const browserProvider = new ethers.BrowserProvider(ethereumProvider);
      setProvider(browserProvider);

      (async () => {
        try {
          const network = await browserProvider.getNetwork();
          const currentChainId = network.chainId.toString();

          if (currentChainId !== EXPECTED_CHAIN_ID) {
            setLoading(false);
            return;
          }

          // Create contract instances
          const coinFlipContract = new ethers.Contract(
            CONTRACT_ADDRESS,
            coinFlipABI,
            browserProvider
          );
          setContract(coinFlipContract);

          // Create referral registry contract instance
          const referralRegContract = new ethers.Contract(
            REFERRAL_REGISTRY_ADDRESS,
            referralRegistryABI,
            browserProvider
          );
          setReferralContract(referralRegContract);

          // Load leaderboard data based on active tab
          if (activeTab === "onchain") {
            await loadLeaderboard(coinFlipContract, browserProvider);
          } else if (activeTab === "referrals") {
            await loadReferralLeaderboard(referralRegContract, browserProvider);
          }
        } catch (e: any) {
          console.error("Leaderboard setup error:", e);
          setError(e?.message || "Failed to setup leaderboard");
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
  }, [connectedWallet, walletProviders, CONTRACT_ADDRESS, activeTab]);

  // Reload when tab changes
  useEffect(() => {
    if (activeTab === "points") {
      loadPointsLeaderboard();
      return;
    }
    
    if (!provider) return;
    
    if (activeTab === "onchain" && contract) {
      loadLeaderboard(contract, provider);
    } else if (activeTab === "referrals" && referralContract) {
      loadReferralLeaderboard(referralContract, provider);
    }
  }, [activeTab, contract, referralContract, provider]);

  // Re-sort when sortBy changes
  useEffect(() => {
    if (players.length > 0 && !loading) {
      const sorted = [...players].sort((a, b) => {
        switch (sortBy) {
          case "wins":
            return b.wins - a.wins;
          case "plays":
            return b.plays - a.plays;
          case "winRate":
            return b.winRate - a.winRate;
          default:
            return 0;
        }
      });
      setPlayers(sorted);
    }
  }, [sortBy, loading]);

  const loadLeaderboard = async (contract: ethers.Contract, provider: ethers.BrowserProvider) => {
    try {
      setLoading(true);
      setError(null);
      console.log("📊 Loading leaderboard...");

      // Query BetResolved events to get all unique player addresses
      console.log("🔍 Creating event filter...");
      const filter = contract.filters.BetResolved();
      
      // Get current block number
      console.log("🔍 Getting current block number...");
      const currentBlock = await provider.getBlockNumber();
      console.log(`📦 Current block: ${currentBlock}`);
      
      // RPC providers typically limit queries to 100,000 blocks
      // Query in chunks to avoid exceeding the limit
      const MAX_BLOCK_RANGE = 100000;
      const fromBlock = Math.max(0, currentBlock - MAX_BLOCK_RANGE);
      console.log(`🔍 Querying BetResolved events from block ${fromBlock} to ${currentBlock} (last ${currentBlock - fromBlock} blocks)...`);
      
      // Helper function to query events in chunks
      const queryEventsInChunks = async (eventFilter: any, startBlock: number, endBlock: number): Promise<any[]> => {
        const allEvents: any[] = [];
        let currentStart = startBlock;
        
        while (currentStart <= endBlock) {
          const currentEnd = Math.min(currentStart + MAX_BLOCK_RANGE - 1, endBlock);
          console.log(`  Querying blocks ${currentStart} to ${currentEnd}...`);
          
          try {
            const chunkEvents = await contract.queryFilter(eventFilter, currentStart, currentEnd);
            allEvents.push(...chunkEvents);
            console.log(`  ✅ Found ${chunkEvents.length} events in this chunk`);
          } catch (chunkError: any) {
            console.warn(`  ⚠️ Error querying chunk ${currentStart}-${currentEnd}:`, chunkError.message);
            // Continue with next chunk even if one fails
          }
          
          currentStart = currentEnd + 1;
          
          // Small delay to avoid rate limiting
          if (currentStart <= endBlock) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        return allEvents;
      };
      
      let events: any[] = [];
      try {
        // Try querying last 100k blocks first (most recent players)
        events = await queryEventsInChunks(filter, fromBlock, currentBlock);
        console.log(`✅ Found ${events.length} BetResolved events`);
        
        // If we got events but want to check older blocks too, query backwards in chunks
        if (events.length > 0 && fromBlock > 0) {
          console.log("🔍 Checking older blocks for more players...");
          let olderFromBlock = Math.max(0, fromBlock - MAX_BLOCK_RANGE);
          const olderEvents = await queryEventsInChunks(filter, olderFromBlock, fromBlock - 1);
          if (olderEvents.length > 0) {
            events.push(...olderEvents);
            console.log(`✅ Found ${olderEvents.length} additional events from older blocks`);
          }
        }
      } catch (queryError: any) {
        console.warn("⚠️ Error querying BetResolved events, trying BetPlaced events instead:", queryError);
        
        // Fallback: Try BetPlaced events instead
        try {
          const betPlacedFilter = contract.filters.BetPlaced();
          events = await queryEventsInChunks(betPlacedFilter, fromBlock, currentBlock);
          console.log(`✅ Found ${events.length} BetPlaced events (using as fallback)`);
        } catch (fallbackError) {
          console.error("❌ Both BetResolved and BetPlaced queries failed:", fallbackError);
          // Don't throw - will use backend fallback
          events = [];
        }
      }
      
      // If events query completely failed, don't throw - use backend fallback instead
      if (events.length === 0) {
        console.log("⚠️ No events found, will use backend database fallback");
      }

      // Get unique player addresses from events
      const uniqueAddresses = new Set<string>();
      events.forEach((event: any) => {
        try {
          const parsed = contract.interface.parseLog(event);
          if (parsed && parsed.args) {
            // BetResolved event args: [betId, player, guess, outcome, won, amount, payout, profit]
            // BetPlaced event args: [betId, player, guess, amount, clientSeed]
            // Try accessing by name first, then by index
            const player = parsed.args.player || parsed.args[1];
            if (player) {
              uniqueAddresses.add(player.toString().toLowerCase());
            }
          }
        } catch (e) {
          // Try direct access if parseLog fails
          if (event.args) {
            const player = event.args.player || event.args[1];
            if (player) {
              uniqueAddresses.add(player.toString().toLowerCase());
            }
          }
        }
      });

      console.log(`👥 Found ${uniqueAddresses.size} unique players from events`);

      // Fallback: If no events found, try getting addresses from backend database
      if (uniqueAddresses.size === 0) {
        console.log("⚠️ No players found in events, trying backend database as fallback...");
        try {
          const backendLeaderboard = await getLeaderboard(100); // Get up to 100 users
          backendLeaderboard.forEach((user) => {
            if (user.walletAddress) {
              uniqueAddresses.add(user.walletAddress.toLowerCase());
            }
          });
          console.log(`✅ Found ${uniqueAddresses.size} players from backend database`);
        } catch (backendError) {
          console.error("❌ Backend fallback also failed:", backendError);
        }
      }

      if (uniqueAddresses.size === 0) {
        console.log("⚠️ No players found in events or database");
        setPlayers([]);
        setLoading(false);
        return;
      }

      // Fetch stats for each player
      const playerStatsPromises = Array.from(uniqueAddresses).map(async (address) => {
        try {
          const stats = await contract.stats(address);
          const plays = Number(stats.plays ?? 0);
          const wins = Number(stats.wins ?? 0);
          const wagered = stats.wagered ?? 0n;
          const paidOut = stats.paidOut ?? 0n;
          const winRate = plays > 0 ? (wins / plays) * 100 : 0;

          return {
            address,
            plays,
            wins,
            wagered,
            paidOut,
            winRate,
          } as PlayerStats;
        } catch (e) {
          console.error(`Error fetching stats for ${address}:`, e);
          return null;
        }
      });

      const allStats = await Promise.all(playerStatsPromises);
      const validStats = allStats.filter((stat): stat is PlayerStats => stat !== null);
      console.log(`✅ Loaded stats for ${validStats.length} players`);

      // Sort players
      const sorted = [...validStats].sort((a, b) => {
        switch (sortBy) {
          case "wins":
            return b.wins - a.wins;
          case "plays":
            return b.plays - a.plays;
          case "winRate":
            return b.winRate - a.winRate;
          default:
            return 0;
        }
      });

      setPlayers(sorted);
    } catch (e: any) {
      console.error("❌ Error loading leaderboard:", e);
      setError(e?.message || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  const loadReferralLeaderboard = async (contract: ethers.Contract, provider: ethers.BrowserProvider) => {
    try {
      setLoading(true);
      setError(null);
      console.log("📊 Loading referral leaderboard...");

      // Query ReferralUsed events to get all unique referrer addresses
      const filter = contract.filters.ReferralUsed();
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      const MAX_BLOCK_RANGE = 100000;
      const fromBlock = Math.max(0, currentBlock - MAX_BLOCK_RANGE);
      
      // Helper function to query events in chunks
      const queryEventsInChunks = async (eventFilter: any, startBlock: number, endBlock: number): Promise<any[]> => {
        const allEvents: any[] = [];
        let currentStart = startBlock;
        
        while (currentStart <= endBlock) {
          const currentEnd = Math.min(currentStart + MAX_BLOCK_RANGE - 1, endBlock);
          
          try {
            const chunkEvents = await contract.queryFilter(eventFilter, currentStart, currentEnd);
            allEvents.push(...chunkEvents);
          } catch (chunkError: any) {
            console.warn(`⚠️ Error querying chunk ${currentStart}-${currentEnd}:`, chunkError.message);
          }
          
          currentStart = currentEnd + 1;
          if (currentStart <= endBlock) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        return allEvents;
      };
      
      let events: any[] = [];
      try {
        events = await queryEventsInChunks(filter, fromBlock, currentBlock);
        console.log(`✅ Found ${events.length} ReferralUsed events`);
      } catch (queryError: any) {
        console.warn("⚠️ Error querying ReferralUsed events:", queryError);
        events = [];
      }

      // Get unique referrer addresses from events
      const uniqueReferrers = new Set<string>();
      events.forEach((event: any) => {
        try {
          const parsed = contract.interface.parseLog(event);
          if (parsed && parsed.args) {
            // ReferralUsed event args: [referrer, referee, code]
            const referrer = parsed.args.referrer || parsed.args[0];
            if (referrer) {
              uniqueReferrers.add(referrer.toString().toLowerCase());
            }
          }
        } catch (e) {
          if (event.args) {
            const referrer = event.args.referrer || event.args[0];
            if (referrer) {
              uniqueReferrers.add(referrer.toString().toLowerCase());
            }
          }
        }
      });

      console.log(`👥 Found ${uniqueReferrers.size} unique referrers from events`);

      // Fallback: If no events found, try getting addresses from backend database
      if (uniqueReferrers.size === 0) {
        console.log("⚠️ No referrers found in events, trying backend database as fallback...");
        try {
          const backendLeaderboard = await getLeaderboard(100);
          // Get all users who have referralUsed = true (they were referred by someone)
          // We need to query the contract to find their referrers
          for (const user of backendLeaderboard) {
            try {
              const referrerAddress = await contract.referrerOf(user.walletAddress);
              if (referrerAddress && referrerAddress !== ethers.ZeroAddress) {
                uniqueReferrers.add(referrerAddress.toString().toLowerCase());
              }
            } catch (e) {
              // Skip if can't get referrer
            }
          }
          console.log(`✅ Found ${uniqueReferrers.size} referrers from backend database`);
        } catch (backendError) {
          console.error("❌ Backend fallback also failed:", backendError);
        }
      }

      if (uniqueReferrers.size === 0) {
        console.log("⚠️ No referrers found");
        setReferrals([]);
        setLoading(false);
        return;
      }

      // Fetch stats for each referrer
      const referralStatsPromises = Array.from(uniqueReferrers).map(async (address) => {
        try {
          const [code, totalReferrals, active] = await contract.getReferrerStats(address);
          const referralsCount = Number(totalReferrals ?? 0);
          const points = referralsCount * 20; // 20 points per referral
          return {
            address,
            totalReferrals: referralsCount,
            referralPoints: points,
            code: code !== ethers.ZeroHash ? ethers.hexlify(code).slice(0, 10) + "..." : "N/A",
            active: active ?? false,
          } as ReferralStats;
        } catch (e) {
          console.error(`Error fetching referral stats for ${address}:`, e);
          return null;
        }
      });

      const allStats = await Promise.all(referralStatsPromises);
      const validStats = allStats.filter((stat): stat is ReferralStats => stat !== null && stat.totalReferrals > 0);
      console.log(`✅ Loaded stats for ${validStats.length} referrers`);

      // Sort by referralPoints (descending)
      const sorted = [...validStats].sort((a, b) => b.referralPoints - a.referralPoints);

      setReferrals(sorted);
    } catch (e: any) {
      console.error("❌ Error loading referral leaderboard:", e);
      setError(e?.message || "Failed to load referral leaderboard");
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatUSDC = (amount: bigint, decimals: number = 6) => {
    return ethers.formatUnits(amount, decimals);
  };

  return (
    <div className="space-y-2 sm:space-y-4">
      <div className="text-center">
        <h2 className="text-lg sm:text-2xl font-bold font-pixel text-gradient-cyan mb-1 sm:mb-2">
          🏆 LEADERBOARD 🏆
        </h2>
        <p className="text-xs sm:text-sm font-retro text-muted-foreground">
          {activeTab === "onchain" 
            ? "Top players ranked by their performance" 
            : activeTab === "referrals"
            ? "Top referrers ranked by referral points"
            : "Top players ranked by database points"}
        </p>
      </div>

      {/* Tabs */}
      <div className="win98-border-inset p-1 sm:p-3 bg-secondary">
        <div className="flex gap-0.5 sm:gap-2">
          <button
            className={`win98-border px-1 sm:px-3 py-0.5 sm:py-2 text-[5px] sm:text-sm font-pixel flex-1 min-w-0 truncate leading-tight ${
              activeTab === "onchain"
                ? "bg-blue-500 text-white font-bold"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
            onClick={() => setActiveTab("onchain")}
          >
            🎮 <span className="hidden sm:inline">Onchain </span>Stats
          </button>
          <button
            className={`win98-border px-1 sm:px-3 py-0.5 sm:py-2 text-[5px] sm:text-sm font-pixel flex-1 min-w-0 truncate leading-tight ${
              activeTab === "referrals"
                ? "bg-blue-500 text-white font-bold"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
            onClick={() => setActiveTab("referrals")}
          >
            🔗 Referrals
          </button>
          <button
            className={`win98-border px-1 sm:px-3 py-0.5 sm:py-2 text-[5px] sm:text-sm font-pixel flex-1 min-w-0 truncate leading-tight ${
              activeTab === "points"
                ? "bg-blue-500 text-white font-bold"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
            onClick={() => setActiveTab("points")}
          >
            ⭐ Points
          </button>
        </div>
      </div>

      {/* Sort Options - Only show for onchain tab */}
      {activeTab === "onchain" && (
        <div className="win98-border-inset p-2 sm:p-3 bg-secondary">
        <div className="text-xs sm:text-sm font-retro text-gray-700 mb-1 sm:mb-2">Sort By:</div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
          {[
            { key: "wins" as const, label: "Wins" },
            { key: "plays" as const, label: "Plays" },
            { key: "winRate" as const, label: "Win Rate" },
          ].map((option) => (
            <button
              key={option.key}
              className={`win98-border px-2 sm:px-3 py-1.5 sm:py-1 text-xs font-pixel ${
                sortBy === option.key
                  ? "bg-blue-500 text-gray-900 font-bold"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
              onClick={() => setSortBy(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="win98-border-inset p-2 sm:p-3 bg-red-100 border-red-500">
          <p className="text-xs sm:text-sm font-pixel text-red-700">❌ Error: {error}</p>
        </div>
      )}

      {/* Leaderboard - Desktop Table / Mobile Cards */}
      {loading ? (
        <div className="win98-border-inset p-6 sm:p-8 bg-secondary text-center">
          <p className="text-sm sm:text-lg font-pixel text-gray-600">Loading leaderboard...</p>
        </div>
      ) : activeTab === "points" ? (
        // Points Leaderboard
        points.length === 0 ? (
          <div className="win98-border-inset p-6 sm:p-8 bg-secondary text-center">
            <p className="text-sm sm:text-lg font-pixel text-gray-600">No players with points found yet. Be the first!</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block win98-border-inset p-2 sm:p-4 bg-secondary">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-16" />
                    <col className="w-40" />
                    <col className="w-32" />
                    <col className="w-24" />
                  </colgroup>
                  <thead>
                    <tr className="border-b-2 border-gray-400">
                      <th className="text-left text-gray-600 p-2 font-pixel text-xs sm:text-sm">Rank</th>
                      <th className="text-left text-gray-600 p-2 font-pixel text-xs sm:text-sm">Address</th>
                      <th className="text-right text-gray-600 p-2 font-pixel text-xs sm:text-sm">Points</th>
                      <th className="text-right text-gray-600 p-2 font-pixel text-xs sm:text-sm">Flips</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point, index) => (
                      <tr
                        key={point.address}
                        className={`border-b border-gray-300 ${
                          connectedWallet?.toLowerCase() === point.address.toLowerCase()
                            ? "bg-blue-100"
                            : ""
                        }`}
                      >
                        <td className="p-2 font-pixel text-xs sm:text-sm">
                          {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                        </td>
                        <td className="p-2 font-retro text-xs font-mono truncate text-gray-600">
                          {formatAddress(point.address)}
                        </td>
                        <td className="p-2 font-pixel text-xs sm:text-sm text-right text-green-600 font-bold">
                          {point.points.toLocaleString()}
                        </td>
                        <td className="p-2 font-pixel text-xs sm:text-sm text-right text-gray-800">
                          {point.flips}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-2">
              {points.map((point, index) => (
                <div
                  key={point.address}
                  className={`win98-border-inset p-3 bg-secondary ${
                    connectedWallet?.toLowerCase() === point.address.toLowerCase()
                      ? "bg-blue-100"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-pixel text-base">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                      </span>
                      <span className="font-retro text-xs font-mono text-gray-600">
                        {formatAddress(point.address)}
                      </span>
                    </div>
                    {connectedWallet?.toLowerCase() === point.address.toLowerCase() && (
                      <span className="text-xs font-pixel text-blue-600">(You)</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-retro text-gray-600">Points:</span>
                      <span className="font-pixel text-green-600 font-bold">{point.points.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-retro text-gray-600">Flips:</span>
                      <span className="font-pixel text-green-600">{point.flips}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      ) : activeTab === "referrals" ? (
        // Referral Leaderboard
        referrals.length === 0 ? (
          <div className="win98-border-inset p-6 sm:p-8 bg-secondary text-center">
            <p className="text-sm sm:text-lg font-pixel text-gray-600">No referrers found yet. Be the first!</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block win98-border-inset p-2 sm:p-4 bg-secondary">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-16" />
                    <col className="w-40" />
                    <col className="w-32" />
                    <col className="w-24" />
                  </colgroup>
                  <thead>
                    <tr className="border-b-2 border-gray-400">
                      <th className="text-left text-gray-600 p-2 font-pixel text-xs sm:text-sm">Rank</th>
                      <th className="text-left text-gray-600 p-2 font-pixel text-xs sm:text-sm">Address</th>
                      <th className="text-right text-gray-600 p-2 font-pixel text-xs sm:text-sm">Referral Points</th>
                      <th className="text-center text-gray-600 p-2 font-pixel text-xs sm:text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((referral, index) => (
                      <tr
                        key={referral.address}
                        className={`border-b border-gray-300 ${
                          connectedWallet?.toLowerCase() === referral.address.toLowerCase()
                            ? "bg-blue-100"
                            : ""
                        }`}
                      >
                        <td className="p-2 font-pixel text-xs sm:text-sm">
                          {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                        </td>
                        <td className="p-2 font-retro text-xs font-mono truncate text-gray-600">
                          {formatAddress(referral.address)}
                        </td>
                        <td className="p-2 font-pixel text-xs sm:text-sm text-right text-green-600 font-bold">
                          {referral.referralPoints}
                        </td>
                        <td className="p-2 font-pixel text-xs sm:text-sm text-center">
                          <span className={`px-2 py-1 rounded ${referral.active ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                            {referral.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-2">
              {referrals.map((referral, index) => (
                <div
                  key={referral.address}
                  className={`win98-border-inset p-3 bg-secondary ${
                    connectedWallet?.toLowerCase() === referral.address.toLowerCase()
                      ? "bg-blue-100"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-pixel text-base">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                      </span>
                      <span className="font-retro text-xs font-mono text-gray-600">
                        {formatAddress(referral.address)}
                      </span>
                    </div>
                    {connectedWallet?.toLowerCase() === referral.address.toLowerCase() && (
                      <span className="text-xs font-pixel text-blue-600">(You)</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-retro text-gray-600">Points:</span>
                      <span className="font-pixel text-green-600 font-bold">{referral.referralPoints}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-retro text-gray-600">Status:</span>
                      <span className={`font-pixel ${referral.active ? "text-green-600" : "text-gray-600"}`}>
                        {referral.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      ) : players.length === 0 ? (
        <div className="win98-border-inset p-6 sm:p-8 bg-secondary text-center">
          <p className="text-sm sm:text-lg font-pixel text-gray-600">No players found yet. Be the first!</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden sm:block win98-border-inset p-2 sm:p-4 bg-secondary">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-16" />
                  <col className="w-40" />
                  <col className="w-16" />
                  <col className="w-16" />
                  <col className="w-24" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-gray-400">
                    <th className="text-left text-gray-600 p-2 font-pixel text-xs sm:text-sm">Rank</th>
                    <th className="text-left text-gray-600 p-2 font-pixel text-xs sm:text-sm">Address</th>
                    <th className="text-right text-gray-600 p-2 font-pixel text-xs sm:text-sm">Wins</th>
                    <th className="text-right text-gray-600 p-2 font-pixel text-xs sm:text-sm">Plays</th>
                    <th className="text-right text-gray-600 p-2 font-pixel text-xs sm:text-sm">Win Rate</th>
                    <th className="text-right text-gray-600 p-2 font-pixel text-xs sm:text-sm">Paid Out</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player, index) => (
                    <tr
                      key={player.address}
                      className={`border-b border-gray-300 ${
                        connectedWallet?.toLowerCase() === player.address.toLowerCase()
                          ? "bg-blue-100"
                          : ""
                      }`}
                    >
                      <td className="p-2 font-pixel text-xs sm:text-sm">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                      </td>
                      <td className="p-2 font-retro text-xs font-mono truncate text-gray-600">
                        {formatAddress(player.address)}
                      </td>
                      <td className="p-2 font-pixel text-xs sm:text-sm text-right text-green-600 font-bold">
                        {player.wins}
                      </td>
                      <td className="p-2 font-pixel text-xs sm:text-sm text-right text-gray-800">
                        {player.plays}
                      </td>
                      <td className="p-2 font-pixel text-xs sm:text-sm text-right text-gray-800">
                        {player.winRate.toFixed(1)}%
                      </td>
                     
                      <td className="p-2 font-pixel text-xs sm:text-sm text-right text-green-600 truncate">
                        {formatUSDC(player.paidOut)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="sm:hidden space-y-2">
            {players.map((player, index) => (
              <div
                key={player.address}
                className={`win98-border-inset p-3 bg-secondary ${
                  connectedWallet?.toLowerCase() === player.address.toLowerCase()
                    ? "bg-blue-100"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-base">
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                    </span>
                    <span className="font-retro text-xs font-mono text-gray-600">
                      {formatAddress(player.address)}
                    </span>
                  </div>
                  {connectedWallet?.toLowerCase() === player.address.toLowerCase() && (
                    <span className="text-xs font-pixel text-blue-600">(You)</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-retro text-gray-600">Wins:</span>
                    <span className="font-pixel text-green-600 font-bold">{player.wins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-retro text-gray-600">Plays:</span>
                    <span className="font-pixel text-green-600">{player.plays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-retro text-gray-600">Win Rate:</span>
                    <span className="font-pixel text-green-600">{player.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-retro text-gray-600">Paid Out:</span>
                    <span className="font-pixel text-green-600">{formatUSDC(player.paidOut)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Info */}
      <div className="win98-border p-2 sm:p-3 bg-gray-100">
        <p className="text-[10px] sm:text-xs font-retro text-gray-700">
          💡 {activeTab === "points" 
            ? "Points leaderboard data is fetched from the database. Your address is highlighted in blue."
            : "Leaderboard data is fetched directly from the blockchain. Your address is highlighted in blue."}
        </p>
      </div>
    </div>
  );
};

