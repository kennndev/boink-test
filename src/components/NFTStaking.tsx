import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { useToast } from "@/hooks/use-toast";

interface NFTStakingProps {
  connectedWallet: string | null;
  connectedWalletName?: string | null;
  walletProviders: Record<string, any>;
}

interface NFT {
  tokenId: string;
  staked: boolean;
  name?: string;
  imageUrl?: string;
  tokenUri?: string;
}

// Minimal ERC721 ABI
const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function tokenURI(uint256 tokenId) view returns (string)",
];

// NFT Staking Contract ABI
const STAKING_ABI = [
  "function stake(uint256[] calldata tokenIds) external",
  "function unstake(uint256[] calldata tokenIds) external",
  "function stakedTokensOf(address user) external view returns (uint256[])",
  "function totalStaked() external view returns (uint256)",
  "function stakedCount(address user) external view returns (uint256)",
  "function isPaused() external view returns (bool)",
  "function getContractInfo() external view returns (address, uint256, uint256, bool)",
];

export const NFTStaking = ({ connectedWallet, connectedWalletName, walletProviders }: NFTStakingProps) => {
  const [nftContract, setNftContract] = useState<ethers.Contract | null>(null);
  const [stakingContract, setStakingContract] = useState<ethers.Contract | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  const [userNFTs, setUserNFTs] = useState<NFT[]>([]);
  const [stakedNFTs, setStakedNFTs] = useState<NFT[]>([]);
  const [selectedNFTs, setSelectedNFTs] = useState<Set<string>>(new Set());
  const [selectedStakedNFTs, setSelectedStakedNFTs] = useState<Set<string>>(new Set());

  const [totalStaked, setTotalStaked] = useState<number>(0);
  const [userStakedCount, setUserStakedCount] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const [userPoints, setUserPoints] = useState<number>(0);
  const [pendingPoints, setPendingPoints] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [staking, setStaking] = useState(false);
  const [unstaking, setUnstaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const NFT_CONTRACT_ADDRESS = import.meta.env.VITE_NFT_CONTRACT_ADDRESS || "0x6De023BEA9EE6C99B69c5798C439eb92097A20e9";
  const STAKING_CONTRACT_ADDRESS = import.meta.env.VITE_STAKING_CONTRACT_ADDRESS || "0xBE1F446338737E3A9d60fD0a71cf9C53f329E7dd";
  const EXPECTED_CHAIN_ID = import.meta.env.VITE_CHAIN_ID || "57073";
  const VITE_RPC_URL = "https://rpc-gel.inkonchain.com";
  const API_URL = import.meta.env.VITE_API_URL || "https://boink-test.vercel.app";
  const IPFS_GATEWAYS = [
    import.meta.env.VITE_IPFS_GATEWAY,
    "https://cloudflare-ipfs.com/ipfs/",
    "https://dweb.link/ipfs/",
    "https://ipfs.io/ipfs/"
  ].filter(Boolean);

  // Initialize contracts
  useEffect(() => {
    if (!connectedWallet) {
      setLoading(false);
      return;
    }

    const initContracts = async () => {
      try {
        setLoading(true);
        setError(null);

        const walletName = connectedWalletName || "MetaMask";
        const ethereumProvider = walletProviders[walletName] || (window as any).ethereum;

        if (!ethereumProvider || typeof ethereumProvider.request !== "function") {
          throw new Error("Wallet provider not available");
        }

        const browserProvider = new ethers.BrowserProvider(ethereumProvider);
        const network = await browserProvider.getNetwork();
        const currentChainId = network.chainId.toString();

        if (currentChainId !== EXPECTED_CHAIN_ID) {
          throw new Error(`Please switch to Ink network (Chain ID: ${EXPECTED_CHAIN_ID})`);
        }

        const walletSigner = await browserProvider.getSigner();

        const nft = new ethers.Contract(NFT_CONTRACT_ADDRESS, ERC721_ABI, walletSigner);
        const stakingC = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, walletSigner);

        setProvider(browserProvider);
        setNftContract(nft);
        setStakingContract(stakingC);

        await loadData(nft, stakingC, connectedWallet, browserProvider);
      } catch (e: any) {
        console.error("Error initializing contracts:", e);
        setError(e?.message || "Failed to initialize contracts");
        setLoading(false);
      }
    };

    initContracts();
  }, [connectedWallet, connectedWalletName, walletProviders]);

  // Periodically refresh staking points
  useEffect(() => {
    if (!connectedWallet) return;

    // Initial fetch
    fetchStakingPoints(connectedWallet);

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchStakingPoints(connectedWallet);
    }, 30000);

    return () => clearInterval(interval);
  }, [connectedWallet]);

  const resolveUri = (uri: string, gateway = IPFS_GATEWAYS[0]) => {
    if (!uri) return "";
    if (uri.startsWith("ipfs://")) return `${gateway}${uri.slice(7)}`;
    if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
    return uri;
  };

  const getIpfsGatewayUrls = (uri: string) => {
    if (!uri) return [];
    if (uri.startsWith("ipfs://")) {
      const cid = uri.slice(7);
      return IPFS_GATEWAYS.map((g) => `${g}${cid}`);
    }
    for (const gateway of IPFS_GATEWAYS) {
      if (uri.startsWith(gateway)) {
        const cid = uri.slice(gateway.length);
        return IPFS_GATEWAYS.map((g) => `${g}${cid}`);
      }
    }
    return [];
  };

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>, uri: string) => {
    const img = event.currentTarget;
    const urls = getIpfsGatewayUrls(uri || img.src);
    if (urls.length === 0) return;
    const currentIndex = urls.findIndex((u) => img.src === u);
    const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1;
    if (nextIndex >= urls.length) return;
    img.src = urls[nextIndex];
  };

  const fetchTokenMetadata = async (nft: ethers.Contract, tokenId: string) => {
    try {
      const tokenUri = await nft.tokenURI(tokenId);
      if (!tokenUri) return {};

      if (tokenUri.startsWith("data:application/json;base64,")) {
        const json = JSON.parse(atob(tokenUri.slice(29)));
        return { tokenUri, name: json.name, imageUrl: resolveUri(json.image || json.image_url || "") };
      }

      const gatewaysToTry = tokenUri.startsWith("ipfs://") ? IPFS_GATEWAYS : [null];
      for (const gateway of gatewaysToTry) {
        const resolved = gateway ? resolveUri(tokenUri, gateway) : resolveUri(tokenUri);
        if (!resolved) continue;
        const resp = await fetch(resolved);
        if (!resp.ok) continue;
        const json = await resp.json();
        return { tokenUri, name: json.name, imageUrl: resolveUri(json.image || json.image_url || "") };
      }

      return { tokenUri };
    } catch {
      return {};
    }
  };

  // Fetch staking points from backend
  const fetchStakingPoints = async (walletAddress: string) => {
    try {
      const response = await fetch(`${API_URL}/api/staking/info/${walletAddress}`);
      const data = await response.json();

      if (data.success) {
        setUserPoints(data.data.totalPoints || 0);
        setPendingPoints(data.data.pendingPoints || 0);
      }
    } catch (error) {
      console.error('Error fetching staking points:', error);
    }
  };

  // Fetch user's NFTs using eth_getLogs via Ink RPC
  const fetchUserNFTs = async (nft: ethers.Contract, walletAddress: string): Promise<string[]> => {
    const balance = await nft.balanceOf(walletAddress);
    const balanceNum = Number(balance);
    if (balanceNum === 0) return [];

    const rpcProvider = new ethers.JsonRpcProvider(VITE_RPC_URL);
    const currentBlock = await rpcProvider.getBlockNumber();
    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    const paddedAddress = ethers.zeroPadValue(walletAddress, 32);
    const DEPLOY_BLOCK = Number(import.meta.env.VITE_NFT_DEPLOY_BLOCK) || 0;
    const CHUNK = 100000;

    const candidateTokenIds = new Set<string>();
    let from = DEPLOY_BLOCK;

    while (from <= currentBlock) {
      const to = Math.min(from + CHUNK - 1, currentBlock);
      try {
        const logs = await rpcProvider.getLogs({
          address: NFT_CONTRACT_ADDRESS,
          topics: [transferTopic, null, paddedAddress],
          fromBlock: from,
          toBlock: to,
        });
        for (const log of logs) {
          if (log.topics[3]) candidateTokenIds.add(BigInt(log.topics[3]).toString());
        }
      } catch (e) {
        console.warn("Chunk failed:", e);
      }
      from = to + 1;
    }

    const results = await Promise.all(
      Array.from(candidateTokenIds).map(async (tokenId) => {
        try {
          const owner = await nft.ownerOf(tokenId);
          return owner.toLowerCase() === walletAddress.toLowerCase() ? tokenId : null;
        } catch {
          return null;
        }
      })
    );

    return results.filter((id): id is string => id !== null);
  };

  // Load all staking data
  const loadData = async (
    nft: ethers.Contract,
    stakingC: ethers.Contract,
    walletAddress: string,
    ethProvider?: ethers.BrowserProvider
  ) => {
    try {
      setLoading(true);
      setError(null);

      const providerToUse = ethProvider || provider;
      if (!providerToUse) throw new Error("Provider not available");

      // Fetch contract info
      try {
        const info = await stakingC.getContractInfo();
        // info: [stakingNft, totalStaked, maxBatch, paused]
        setIsPaused(info[3]);
        setTotalStaked(Number(info[1]));
      } catch {
        // Fallback to individual calls
        const [paused, total] = await Promise.all([
          stakingC.isPaused(),
          stakingC.totalStaked(),
        ]);
        setIsPaused(paused);
        setTotalStaked(Number(total));
      }

      // Get user's staked NFTs
      let stakedTokenIdStrings: string[] = [];
      try {
        const stakedTokenIds = await stakingC.stakedTokensOf(walletAddress);
        stakedTokenIdStrings = stakedTokenIds.map((id: bigint) => id.toString());
      } catch (e) {
        console.error("stakedTokensOf failed:", e);
      }

      const staked: NFT[] = await Promise.all(
        stakedTokenIdStrings.map(async (tokenId) => {
          const metadata = await fetchTokenMetadata(nft, tokenId);
          return { tokenId, staked: true, ...metadata };
        })
      );
      setStakedNFTs(staked);
      setUserStakedCount(staked.length);

      // Get user's wallet NFTs (exclude staked ones)
      const stakedSet = new Set(stakedTokenIdStrings);
      const tokenIds = (await fetchUserNFTs(nft, walletAddress)).filter((id) => !stakedSet.has(id));

      const nftDetails = await Promise.all(
        tokenIds.map(async (tokenId) => {
          const metadata = await fetchTokenMetadata(nft, tokenId);
          return { tokenId, staked: false, ...metadata };
        })
      );
      setUserNFTs(nftDetails);

      // Fetch staking points from backend
      await fetchStakingPoints(walletAddress);

      setLoading(false);
    } catch (e: any) {
      console.error("Error loading data:", e);
      setError(e?.message || "Failed to load NFT data");
      setLoading(false);
    }
  };

  const refreshData = async () => {
    if (nftContract && stakingContract && connectedWallet && provider) {
      await loadData(nftContract, stakingContract, connectedWallet, provider);
    }
  };

  const toggleNFTSelection = (tokenId: string) => {
    const s = new Set(selectedNFTs);
    s.has(tokenId) ? s.delete(tokenId) : s.add(tokenId);
    setSelectedNFTs(s);
  };

  const toggleStakedNFTSelection = (tokenId: string) => {
    const s = new Set(selectedStakedNFTs);
    s.has(tokenId) ? s.delete(tokenId) : s.add(tokenId);
    setSelectedStakedNFTs(s);
  };

  // Stake NFTs
  const handleStake = async () => {
    if (!stakingContract || !nftContract || selectedNFTs.size === 0) return;
    try {
      setStaking(true);
      const tokenIds = Array.from(selectedNFTs);

      const isApproved = await nftContract.isApprovedForAll(connectedWallet, STAKING_CONTRACT_ADDRESS);
      if (!isApproved) {
        toast({ title: "Approval Required", description: "Approving NFT contract..." });
        const approveTx = await nftContract.setApprovalForAll(STAKING_CONTRACT_ADDRESS, true);
        await approveTx.wait();
        toast({ title: "Approved", description: "NFT contract approved" });
      }

      toast({ title: "Staking NFTs", description: `Staking ${tokenIds.length} NFT(s)...` });
      const stakeTx = await stakingContract.stake(tokenIds);
      await stakeTx.wait();

      toast({ title: "Staked!", description: `Successfully staked ${tokenIds.length} NFT(s)` });

      // Record staking state with backend
      try {
        await fetch(`${API_URL}/api/staking/record-stake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: connectedWallet, tokenIds })
        });
      } catch (e) {
        console.error('Failed to record stake:', e);
      }

      setSelectedNFTs(new Set());
      await refreshData();
    { /* window.location.reload(); */ }
    } catch (e: any) {
      console.error("Staking error:", e);
      toast({ variant: "destructive", title: "Staking Failed", description: e?.message || "Failed to stake NFTs" });
    } finally {
      setStaking(false);
    }
  };

  // Unstake NFTs
  const handleUnstake = async () => {
    if (!stakingContract || selectedStakedNFTs.size === 0) return;
    try {
      setUnstaking(true);
      const tokenIds = Array.from(selectedStakedNFTs);

      toast({ title: "Unstaking NFTs", description: `Unstaking ${tokenIds.length} NFT(s)...` });
      const unstakeTx = await stakingContract.unstake(tokenIds);
      await unstakeTx.wait();

      toast({ title: "Unstaked!", description: `Successfully unstaked ${tokenIds.length} NFT(s)` });

      // Record unstaking state with backend (auto-awards pending points)
      try {
        await fetch(`${API_URL}/api/staking/record-unstake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: connectedWallet, tokenIds })
        });
      } catch (e) {
        console.error('Failed to record unstake:', e);
      }

      setSelectedStakedNFTs(new Set());
      await refreshData();
    } catch (e: any) {
      console.error("Unstaking error:", e);
      toast({ variant: "destructive", title: "Unstaking Failed", description: e?.message || "Failed to unstake NFTs" });
    } finally {
      setUnstaking(false);
    }
  };


  if (!connectedWallet) {
    return (
      <div className="text-center space-y-2 sm:space-y-4">
        <h2 className="text-lg sm:text-2xl font-bold font-military text-gradient-emerald">
          NFT Staking
        </h2>
        <p className="text-sm sm:text-base font-cyber text-gradient-red">
          Connect your wallet to stake your NFTs!
        </p>
        <div className="win98-border p-2 sm:p-4 bg-secondary">
          <p className="text-center text-sm sm:text-lg font-pixel">Connect Wallet Required</p>
          <p className="text-center text-xs sm:text-sm mt-1.5 sm:mt-2 font-retro">
            Click the wallet icon in the taskbar to connect
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg sm:text-2xl font-bold font-pixel text-gradient-purple mb-1">
          NFT STAKING
        </h2>
        <p className="text-[10px] sm:text-xs font-retro text-muted-foreground">
          Stake your NFTs to earn points daily
        </p>
      </div>

      {isPaused && (
        <div className="win98-border-inset p-2 bg-yellow-100">
          <p className="text-xs font-pixel text-yellow-700 text-center">Staking is currently paused</p>
        </div>
      )}

      {error && (
        <div className="win98-border-inset p-2 bg-red-100">
          <p className="text-xs font-pixel text-red-700">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <div className="win98-border-inset p-1.5 sm:p-2 bg-secondary text-center">
          <p className="text-[9px] sm:text-[10px] font-retro text-gray-600">Your Staked</p>
          <p className="text-base sm:text-xl font-pixel text-blue-600 font-bold">{userStakedCount}</p>
        </div>
        <div className="win98-border-inset p-1.5 sm:p-2 bg-secondary text-center">
          <p className="text-[9px] sm:text-[10px] font-retro text-gray-600">Your Points</p>
          <p className="text-base sm:text-xl font-pixel text-purple-600 font-bold">{userPoints}</p>
        </div>
        <div className="win98-border-inset p-1.5 sm:p-2 bg-secondary text-center">
          <p className="text-[9px] sm:text-[10px] font-retro text-gray-600">Total Staked</p>
          <p className="text-base sm:text-xl font-pixel text-green-600 font-bold">{totalStaked}</p>
        </div>
      </div>

      {/* Pending Points */}
      {pendingPoints > 0 && (
        <div className="win98-border-inset p-2 sm:p-3 bg-gradient-to-r from-yellow-50 to-orange-50">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] sm:text-xs font-retro text-gray-600">Pending Points</p>
              <p className="text-[9px] sm:text-[10px] font-retro text-gray-500">
                Auto-awarded daily
              </p>
            </div>
            <p className="text-lg sm:text-xl font-pixel text-orange-600 font-bold">
              +{pendingPoints} points
            </p>
            <p className="text-[9px] sm:text-[10px] font-retro text-gray-600">
              Will be added to your total automatically
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="win98-border-inset p-6 bg-secondary text-center">
          <p className="text-sm font-pixel text-gray-600">Loading your NFTs...</p>
        </div>
      ) : (
        <>
          {/* Unstaked NFTs */}
          <div className="win98-border-inset p-2 sm:p-3 bg-secondary">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h3 className="text-xs sm:text-sm font-bold font-military text-blue-600">
                Your NFTs ({userNFTs.length})
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={refreshData}
                  disabled={loading}
                  className="win98-border px-1.5 py-0.5 text-xs font-pixel text-gray-700 bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                  title="Refresh NFT list"
                  aria-label="Refresh NFT list"
                >
                  🔄
                </button>
                {selectedNFTs.size > 0 && (
                  <button
                    onClick={handleStake}
                    disabled={staking || isPaused}
                    className="win98-border px-2 py-0.5 text-xs font-pixel bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {staking ? "Staking..." : `Stake (${selectedNFTs.size})`}
                  </button>
                )}
              </div>
            </div>

            {userNFTs.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-xs font-retro text-gray-600">No NFTs in your wallet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 sm:gap-2">
                {userNFTs.map((nft) => (
                  <div
                    key={nft.tokenId}
                    onClick={() => !isPaused && toggleNFTSelection(nft.tokenId)}
                    className={`win98-border p-1.5 cursor-pointer hover:bg-blue-50 ${
                      selectedNFTs.has(nft.tokenId) ? "bg-blue-200" : "bg-white"
                    } ${isPaused ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="aspect-square bg-gradient-to-br from-purple-400 to-blue-500 rounded flex items-center justify-center mb-1 overflow-hidden">
                      {nft.imageUrl ? (
                        <img
                          src={nft.imageUrl}
                          alt={`NFT #${nft.tokenId}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(event) => handleImageError(event, nft.imageUrl || "")}
                        />
                      ) : (
                        <span className="text-white text-lg sm:text-xl">NFT</span>
                      )}
                    </div>
                    <p className="text-[9px] sm:text-[10px] font-pixel text-center truncate text-gray-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]">
                      #{nft.tokenId}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staked NFTs */}
          <div className="win98-border-inset p-2 sm:p-3 bg-secondary">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs sm:text-sm font-bold font-military text-green-600">
                Staked NFTs ({stakedNFTs.length})
              </h3>
              {selectedStakedNFTs.size > 0 && (
                <button
                  onClick={handleUnstake}
                  disabled={unstaking}
                  className="win98-border px-2 py-0.5 text-xs font-pixel bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {unstaking ? "Unstaking..." : `Unstake (${selectedStakedNFTs.size})`}
                </button>
              )}
            </div>

            {stakedNFTs.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-xs font-retro text-gray-600">No staked NFTs</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 sm:gap-2">
                {stakedNFTs.map((nft) => (
                  <div
                    key={nft.tokenId}
                    onClick={() => toggleStakedNFTSelection(nft.tokenId)}
                    className={`win98-border p-1.5 cursor-pointer hover:bg-orange-50 ${
                      selectedStakedNFTs.has(nft.tokenId) ? "bg-orange-200" : "bg-white"
                    }`}
                  >
                    <div className="aspect-square bg-gradient-to-br from-green-400 to-emerald-500 rounded flex items-center justify-center mb-1 relative overflow-hidden">
                      {nft.imageUrl ? (
                        <img
                          src={nft.imageUrl}
                          alt={`NFT #${nft.tokenId}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(event) => handleImageError(event, nft.imageUrl || "")}
                        />
                      ) : (
                        <span className="text-white text-lg sm:text-xl">NFT</span>
                      )}
                      <div className="absolute top-0 right-0 bg-green-500 rounded-full w-3 h-3 flex items-center justify-center">
                        <span className="text-white text-[7px]">S</span>
                      </div>
                    </div>
                    <p className="text-[9px] sm:text-[10px] font-pixel text-center truncate text-gray-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]">
                      #{nft.tokenId}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Points Info */}
      <div className="win98-border-inset p-2 sm:p-3 bg-secondary">
        <h3 className="text-xs sm:text-sm font-bold font-military text-gradient-orange mb-1.5">
          Staking Info
        </h3>
        <div className="space-y-1 text-[10px] sm:text-xs font-retro text-gray-700">
          <div className="flex justify-between">
            <span>Daily Points:</span>
            <span className="font-pixel text-blue-600">100 points per NFT</span>
          </div>
          <div className="flex justify-between">
            <span>Your Daily Rate:</span>
            <span className="font-pixel text-green-600">{userStakedCount * 100} points/day</span>
          </div>
          <div className="flex justify-between">
            <span>Staking Contract:</span>
            <span className="font-pixel text-gray-500">{STAKING_CONTRACT_ADDRESS.slice(0, 6)}...{STAKING_CONTRACT_ADDRESS.slice(-4)}</span>
          </div>
          <div className="flex justify-between">
            <span>NFT Contract:</span>
            <span className="font-pixel text-gray-500">{NFT_CONTRACT_ADDRESS.slice(0, 6)}...{NFT_CONTRACT_ADDRESS.slice(-4)}</span>
          </div>
        </div>
      </div>

      {/* Help text */}
      <div className="win98-border p-1.5 sm:p-2 bg-gray-100">
        <p className="text-[9px] sm:text-[10px] font-retro text-gray-600">
          Click NFTs to select, then Stake or Unstake. Earn 100 points daily per staked NFT.
          {isPaused && " Staking is currently paused by the admin."}
        </p>
      </div>
    </div>
  );
};
