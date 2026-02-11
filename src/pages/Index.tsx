import { useState, useEffect } from "react";
import { DesktopIcon } from "@/components/DesktopIcon";
import { Taskbar } from "@/components/Taskbar";
import { Window } from "@/components/Window";
import StakeIcon from "@/assets/site-icon/Stake.png";
import TrashBinIcon from "@/assets/site-icon/Trash-bin.png";
import Winamp from "@/assets/site-icon/Winamp.png";
import Coinflip from "@/assets/site-icon/Coinflip.png";
import PhotosAlbum from "@/assets/site-icon/PhotosAlbum.png";
import EiffelImage from "@/assets/photos-album/2000s eiffel.png";
import HawaiiImage from "@/assets/photos-album/hawaii.png";
import RioImage from "@/assets/photos-album/rio.png";
import RomeImage from "@/assets/photos-album/rome.png";
import ShaolinImage from "@/assets/photos-album/shaolin.png";
import WallpaperImage from "@/assets/photos-album/wallpaper.png";
import gambleShitImage from "@/assets/gamble-shit.png";
import LeaderboardIcon from "@/assets/site-icon/Leaderboard.png";
import ReferralIcon from "@/assets/site-icon/Referral.png";
import infoIcon from "@/assets/site-icon/Info.png";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import type { EthereumProvider } from "@/types/wallet";
import { CoinFlip } from "@/components/CoinFlip";
import { Leaderboard } from "@/components/Leaderboard";
import { WalletConnectModal } from "@/components/WalletConnectModal";
import { Referral } from "@/components/Referral";
import { StartMenu } from "@/components/StartMenu";
import { NFTStaking } from "@/components/NFTStaking";

const Index = () => {
  const [openWindow, setOpenWindow] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showWalletConnectModal, setShowWalletConnectModal] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [connectedWalletName, setConnectedWalletName] = useState<string | null>(null);
  const [blockNumber, setBlockNumber] = useState("29182283");
  const [detectedWallets, setDetectedWallets] = useState<string[]>([]);
  const [walletProviders, setWalletProviders] = useState<Record<string, EthereumProvider>>({});
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [whitepaperContent, setWhitepaperContent] = useState<string>("Loading whitepaper...");
  const [showImageModal, setShowImageModal] = useState<{ src: string; alt: string } | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [pendingRefCode, setPendingRefCode] = useState<string | null>(null);
  const [showStartMenu, setShowStartMenu] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Simulate block number updates
    const interval = setInterval(() => {
      setBlockNumber((prev) => String(Number(prev) + 1));
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Handle Twitter OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const twitterSuccess = urlParams.get('twitter_success');
    const twitterError = urlParams.get('twitter_error');
    const points = urlParams.get('points');

    if (twitterSuccess === 'true') {
      toast({
        title: "🎉 Points Awarded!",
        description: `You earned 50 points for following on Twitter! Total: ${points} points`,
      });
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('twitter_success');
      url.searchParams.delete('points');
      window.history.replaceState({}, '', url.toString());
    } else if (twitterError) {
      const errorMessages: Record<string, string> = {
        'not_following': 'Please follow @boinknfts on Twitter first!',
        'already_claimed': 'You have already claimed Twitter follow points for this wallet!',
        'twitter_already_used': 'This Twitter account has already been used to claim points for another wallet. Each Twitter account can only be used once.',
        'verification_failed': 'Twitter verification failed. Please try again.',
        'api_access_denied': 'Twitter API access denied. Your app may need Elevated access. Check server logs for details.',
        'authentication_failed': 'Twitter authentication failed. Please check your API credentials.',
        'missing_params': 'Invalid Twitter callback. Please try again.',
        'missing_wallet': 'Wallet address missing in callback. Please try again.',
        'invalid_token': 'Invalid OAuth token. Please try the verification process again.'
      };
      toast({
        variant: "destructive",
        title: "Twitter Verification Failed",
        description: errorMessages[twitterError] || 'An error occurred during verification.',
      });
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('twitter_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [toast]);

  // Create audio element for music player
  useEffect(() => {
    const audio = new Audio();
    setAudioRef(audio);
    
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Load whitepaper content
  useEffect(() => {
    const loadWhitepaper = async () => {
      try {
        const response = await fetch('/whitepaper.txt');
        const content = await response.text();
        setWhitepaperContent(content);
      } catch (error) {
        console.error('Failed to load whitepaper:', error);
        setWhitepaperContent('Failed to load whitepaper content. Please try again later.');
      }
    };
    
    loadWhitepaper();
  }, []);

  // Parse referral code from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("refCode");
    
    if (code && /^0x[0-9a-fA-F]{64}$/.test(code)) {
      setPendingRefCode(code);
      localStorage.setItem("coinflip_refCode", code);
    } else {
      // Check localStorage for stored code
      const stored = localStorage.getItem("coinflip_refCode");
      if (stored && /^0x[0-9a-fA-F]{64}$/.test(stored)) {
        setPendingRefCode(stored);
      }
    }
  }, []);

  // Restore wallet connection from localStorage on page load
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const restoreWalletConnection = async () => {
      const savedWallet = localStorage.getItem('coinflip_connectedWallet');
      const savedWalletName = localStorage.getItem('coinflip_connectedWalletName');
      
      if (!savedWallet || !savedWalletName) {
        return; // No saved connection
      }

      // Wait for wallet providers to be detected, then try to restore
      const checkAndRestore = () => {
        const extendedWindow = window as Window & {
          ethereum?: EthereumProvider;
          phantom?: { ethereum?: EthereumProvider };
          rabby?: EthereumProvider;
          backpack?: EthereumProvider & { ethereum?: EthereumProvider };
          coinbaseWalletExtension?: EthereumProvider;
          zerion?: EthereumProvider;
        };

        const providerCandidates: EthereumProvider[] = Array.isArray(extendedWindow.ethereum?.providers)
          ? (extendedWindow.ethereum?.providers ?? []).filter(
              (provider): provider is EthereumProvider => Boolean(provider)
            )
          : extendedWindow.ethereum
          ? [extendedWindow.ethereum]
          : [];

        const findByFlag = (flag: keyof EthereumProvider) =>
          providerCandidates.find((provider) => provider?.[flag]);

        let provider: EthereumProvider | undefined;

        if (savedWalletName === "MetaMask") {
          provider = findByFlag("isMetaMask");
        } else if (savedWalletName === "Rabby Wallet") {
          provider = findByFlag("isRabby") ?? extendedWindow.rabby;
        } else if (savedWalletName === "Coinbase Wallet") {
          provider = findByFlag("isCoinbaseWallet") ?? extendedWindow.coinbaseWalletExtension;
        } else if (savedWalletName === "Zerion") {
          provider = extendedWindow.zerion || (window as any).zerion || 
            providerCandidates.find((p: any) => p?.isZerion || p?.isZerionWallet || p?._isZerion);
        } else if (savedWalletName === "WalletConnect") {
          // WalletConnect needs to be re-initialized, skip auto-restore
          return;
        }

        if (!provider || typeof provider.request !== "function") {
          // Provider not available, clear saved connection
          localStorage.removeItem('coinflip_connectedWallet');
          localStorage.removeItem('coinflip_connectedWalletName');
          return;
        }

        // Try to get accounts from the provider
        provider.request({ method: 'eth_accounts' })
          .then((accounts: string[]) => {
            if (accounts && accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
              // Wallet is still connected with the same address
              setConnectedWallet(savedWallet);
              setConnectedWalletName(savedWalletName);
              setWalletProviders(prev => ({ ...prev, [savedWalletName]: provider! }));
              console.log('✅ Restored wallet connection:', savedWalletName, savedWallet);
            } else {
              // Wallet address changed or disconnected
              localStorage.removeItem('coinflip_connectedWallet');
              localStorage.removeItem('coinflip_connectedWalletName');
            }
          })
          .catch((error) => {
            console.error('Error checking wallet connection:', error);
            localStorage.removeItem('coinflip_connectedWallet');
            localStorage.removeItem('coinflip_connectedWalletName');
          });
      };

      // Wait a bit for providers to initialize, then check
      setTimeout(checkAndRestore, 1000);
    };

    restoreWalletConnection();

    // Listen for wallet disconnection/account changes
    const handleAccountsChanged = (accounts: string[]) => {
      const savedWallet = localStorage.getItem('coinflip_connectedWallet');
      if (savedWallet && (!accounts || accounts.length === 0 || accounts[0].toLowerCase() !== savedWallet.toLowerCase())) {
        // Wallet disconnected or account changed
        setConnectedWallet(null);
        setConnectedWalletName(null);
        localStorage.removeItem('coinflip_connectedWallet');
        localStorage.removeItem('coinflip_connectedWalletName');
      }
    };

    // Listen to ethereum provider events
    const ethereum = (window as any).ethereum;
    if (ethereum) {
      if (ethereum.on) {
        ethereum.on('accountsChanged', handleAccountsChanged);
      } else if (ethereum.addEventListener) {
        ethereum.addEventListener('accountsChanged', handleAccountsChanged);
      }
    }

    return () => {
      // Cleanup listeners
      if (ethereum) {
        if (ethereum.removeListener) {
          ethereum.removeListener('accountsChanged', handleAccountsChanged);
        } else if (ethereum.removeEventListener) {
          ethereum.removeEventListener('accountsChanged', handleAccountsChanged);
        }
      }
    };
  }, []);

  // Detect available wallets on component mount
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const detectWallets = () => {
      const extendedWindow = window as Window & {
        ethereum?: EthereumProvider;
        phantom?: { ethereum?: EthereumProvider };
        rabby?: EthereumProvider;
        backpack?: EthereumProvider & { ethereum?: EthereumProvider };
        coinbaseWalletExtension?: EthereumProvider;
        zerion?: EthereumProvider;
      };

      const providerCandidates: EthereumProvider[] = Array.isArray(extendedWindow.ethereum?.providers)
        ? (extendedWindow.ethereum?.providers ?? []).filter(
            (provider): provider is EthereumProvider => Boolean(provider)
          )
        : extendedWindow.ethereum
        ? [extendedWindow.ethereum]
        : [];

      const detected: string[] = [];
      const providerMap: Record<string, EthereumProvider> = {};

      const register = (name: string, provider?: EthereumProvider) => {
        if (!provider || typeof provider.request !== "function" || detected.includes(name)) {
          return;
        }
        providerMap[name] = provider;
        detected.push(name);
      };

      // Special handling for Zerion - check multiple possible locations
      const findZerion = () => {
        // Check provider candidates for Zerion-specific properties
        const zerionInProviders = providerCandidates.find((p: any) => {
          if (!p) return false;
          
          // Check all possible Zerion identifiers
          const isZerion = 
            p.isZerion || 
            p.isZerionWallet ||
            p._isZerion ||
            p.constructor?.name?.includes('Zerion') ||
            p.constructor?.name?.includes('zerion') ||
            (p as any)?.[Symbol.toStringTag]?.includes('Zerion') ||
            String(p).includes('Zerion') ||
            // Check if provider has Zerion in any string property
            Object.values(p).some((val: any) => 
              typeof val === 'string' && val.toLowerCase().includes('zerion')
            );
          
          if (isZerion) {
            console.log('✅ Found Zerion in provider candidates:', p);
          }
          return isZerion;
        });
        
        // Check window.zerion directly
        const zerionDirect = extendedWindow.zerion || (window as any).zerion;
        if (zerionDirect) {
        }
        
        // Check if Zerion is in window.ethereum.providers but not detected
        const ethereumProviders = (window as any).ethereum?.providers;
        if (Array.isArray(ethereumProviders)) {
          const zerionInEthereumProviders = ethereumProviders.find((p: any) => {
            if (!p) return false;
            return p.isZerion || p.isZerionWallet || p._isZerion ||
                   p.constructor?.name?.includes('Zerion') ||
                   String(p).includes('Zerion');
          });
          if (zerionInEthereumProviders) {
            console.log('✅ Found Zerion in window.ethereum.providers:', zerionInEthereumProviders);
            return zerionInEthereumProviders;
          }
        }
        
        // Debug: Log all providers if Zerion not found
        if (!zerionInProviders && !zerionDirect) {
          
          providerCandidates.forEach((p: any, i: number) => {
            const allKeys = Object.keys(p || {});
            const zerionRelatedKeys = allKeys.filter(k => 
              k.toLowerCase().includes('zerion') || 
              k.toLowerCase().includes('wallet')
            );
            const stringValues = Object.values(p || {}).filter(v => typeof v === 'string').slice(0, 5);
        
          });
        }
        
        return zerionInProviders || zerionDirect;
      };

      const findByFlag = (flag: keyof EthereumProvider) =>
        providerCandidates.find((provider) => provider?.[flag]);

      register("MetaMask", findByFlag("isMetaMask"));
      register("Rabby Wallet", findByFlag("isRabby") ?? extendedWindow.rabby);
      register("Phantom", findByFlag("isPhantom") ?? extendedWindow.phantom?.ethereum);
      register(
        "Backpack",
        findByFlag("isBackpack") ?? extendedWindow.backpack?.ethereum ?? extendedWindow.backpack
      );
      register(
        "Coinbase Wallet",
        findByFlag("isCoinbaseWallet") ?? extendedWindow.coinbaseWalletExtension
      );
      const zerionProvider = findZerion();
      register("Zerion", zerionProvider);
      
      // Fallback: If Zerion extension is installed but not detected, 
      // check if it's available via window.ethereum or as a provider
      if (!zerionProvider && providerCandidates.length > 0) {
        // Check if any undetected provider might be Zerion
        // (This is a fallback in case Zerion doesn't expose standard flags)
        const possibleZerion = providerCandidates.find((p: any, i: number) => {
          // Skip already detected wallets
          const isDetected = detected.some(name => {
            const detectedProvider = providerMap[name];
            return detectedProvider === p;
          });
          if (isDetected) return false;
          
          // Check for any Zerion-like indicators
          const providerStr = JSON.stringify(p).toLowerCase();
          return providerStr.includes('zerion');
        });
        
        if (possibleZerion) {
          console.log('⚠️ Possible Zerion provider found but not confirmed:', possibleZerion);
          // Don't auto-register, but log for debugging
        }
      }

      if (detected.length === 0 && providerCandidates[0]) {
        providerMap["Ethereum Wallet"] = providerCandidates[0];
        detected.push("Ethereum Wallet");
      }

      setWalletProviders(providerMap);
      setDetectedWallets(detected);
    };

    detectWallets();

    const handleEthereumInit = () => detectWallets();

    window.addEventListener("ethereum#initialized", handleEthereumInit as any);

    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      detectWallets();
      if (attempts >= 3) {
        clearInterval(interval);
        window.removeEventListener("ethereum#initialized", handleEthereumInit as any);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("ethereum#initialized", handleEthereumInit as any);
    };
  }, []);

  const handleWalletDisconnect = () => {
    // Clear wallet connection state
    setConnectedWallet(null);
    setConnectedWalletName(null);
    
    // Clear localStorage
    localStorage.removeItem('coinflip_connectedWallet');
    localStorage.removeItem('coinflip_connectedWalletName');
    
    // Clear wallet providers (optional - you might want to keep them)
    // setWalletProviders({});
    
    toast({
      title: "Wallet Disconnected",
      description: "Your wallet has been disconnected",
    });
  };

  const handleWalletConnect = async (walletName: string) => {
     
    try {
      
      let accounts: string[] = [];

      // Check if on mobile and no wallet detected
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (walletName === "WalletConnect") {
        try {
          const chainId = Number(import.meta.env.VITE_CHAIN_ID || "84532");
          const projectId = "97bac2ccf2dc1d7c79854d5bc2686912";
          const rpcMap: Record<number, string> = {
            763373: "https://rpc-gel-sepolia.inkonchain.com",
            8453: "https://mainnet.base.org",
          };

          // Dynamic import with string to avoid build-time resolution issues
          const walletConnectModule = await import(/* @vite-ignore */ "@walletconnect/ethereum-provider");
          const { EthereumProvider } = walletConnectModule;

          const wcProvider = await EthereumProvider.init({
            projectId,
            showQrModal: true,
            chains: [chainId],
            optionalChains: [chainId],
            methods: [
              "eth_sendTransaction",
              "eth_signTransaction",
              "eth_sign",
              "personal_sign",
              "eth_signTypedData"
            ],
            events: ["chainChanged", "accountsChanged"],
            rpcMap,
          });

          // Trigger QR modal and connect
          const wcAccounts = await wcProvider.enable();

          setWalletProviders({ ...walletProviders, WalletConnect: wcProvider as unknown as EthereumProvider });
          // Store both the wallet address and name
          const walletAddress = wcAccounts && wcAccounts.length > 0 ? wcAccounts[0] : null;
          if (walletAddress) {
            setConnectedWallet(walletAddress);
            setConnectedWalletName("WalletConnect");
            
            // Save to localStorage for persistence
            localStorage.setItem('coinflip_connectedWallet', walletAddress);
            localStorage.setItem('coinflip_connectedWalletName', "WalletConnect");
            
            setShowWalletModal(false);
            toast({
              title: "Wallet Connected",
              description: "Connected via WalletConnect",
            });
          }
        } catch (wcError: any) {
          toast({
            variant: "destructive",
            title: "WalletConnect Failed",
            description: wcError?.message || "Could not establish WalletConnect session",
          });
        }
        return;
      }

      // Special handling for Zerion - try multiple ways to access it
      let provider: EthereumProvider | undefined;
      if (walletName === "Zerion") {
        console.log('🔍 Looking for Zerion wallet...');
        console.log('   walletProviders["Zerion"]:', walletProviders["Zerion"]);
        console.log('   window.zerion:', (window as any).zerion);
        console.log('   window.zerionWallet:', (window as any).zerionWallet);
        console.log('   window.ethereum?.providers:', (window as any).ethereum?.providers);
        
        // Re-detect Zerion at click time (it might not be accessible from stored provider)
        const reDetectZerion = () => {
          // Check window.zerion directly
          if ((window as any).zerion && typeof (window as any).zerion.request === "function") {
            return (window as any).zerion;
          }
          if ((window as any).zerionWallet && typeof (window as any).zerionWallet.request === "function") {
            return (window as any).zerionWallet;
          }
          
          // Check providers array
          const providers = (window as any).ethereum?.providers;
          if (Array.isArray(providers)) {
            for (const p of providers) {
              if (!p || p.isMetaMask) continue;
              const isZerion = p.isZerion || p.isZerionWallet || p._isZerion ||
                p.constructor?.name?.includes('Zerion') ||
                String(p).includes('Zerion') ||
                JSON.stringify(p).toLowerCase().includes('zerion');
              if (isZerion && typeof p.request === "function") {
                return p;
              }
            }
          }
          
          return undefined;
        };
        
        const reDetected = reDetectZerion();
        if (reDetected) {
          console.log('✅ Re-detected Zerion at click time');
          provider = reDetected;
        }
           
        // Try to find Zerion in multiple ways - check ALL possible locations
        provider = walletProviders["Zerion"] 
          ?? (window as any).zerion
          ?? (window as any).zerionWallet
          ?? (window as any).ethereum?.providers?.find((p: any) => {
            const isZerion = p?.isZerion || p?.isZerionWallet || p?._isZerion ||
              p?.constructor?.name?.includes('Zerion') ||
              String(p).includes('Zerion');
            if (isZerion) {
              console.log('✅ Found Zerion in providers array:', p);
            }
            return isZerion;
          })
          // Check if any provider in the array has Zerion-like properties
          ?? (Array.isArray((window as any).ethereum?.providers) 
            ? (window as any).ethereum.providers.find((p: any) => {
                if (!p) return false;
                const str = JSON.stringify(p).toLowerCase();
                return str.includes('zerion');
              })
            : undefined);
        
        // If Zerion not found, check if window.ethereum itself might be Zerion
        // (when Zerion is the primary provider)
        if (!provider && (window as any).ethereum) {
          const ethereumProvider = (window as any).ethereum;
          console.log('   Checking window.ethereum for Zerion...');
          console.log('   isMetaMask:', ethereumProvider.isMetaMask);
          console.log('   isZerion:', ethereumProvider.isZerion);
          console.log('   constructor name:', ethereumProvider.constructor?.name);
          
          // Check if this provider might be Zerion by checking internal properties
          const mightBeZerion = 
            ethereumProvider.isZerion || 
            ethereumProvider.isZerionWallet ||
            ethereumProvider._isZerion ||
            ethereumProvider.constructor?.name?.includes('Zerion') ||
            String(ethereumProvider).includes('Zerion') ||
            // Check if the provider has Zerion-specific methods or properties
            (typeof ethereumProvider._state === 'object' && 
             JSON.stringify(ethereumProvider._state || {}).toLowerCase().includes('zerion'));
          
          if (mightBeZerion) {
            console.log('✅ window.ethereum appears to be Zerion');
            provider = ethereumProvider;
          } else {
            // Check if window.ethereum is actually MetaMask - if so, don't use it for Zerion
            const isMetaMask = ethereumProvider.isMetaMask;
            if (isMetaMask) {
              console.log('⚠️ window.ethereum is MetaMask, not Zerion');
              // Don't use MetaMask as fallback for Zerion - show error instead
              provider = undefined;
            } else {
              console.log('⚠️ window.ethereum is not MetaMask, but also not confirmed as Zerion');
              // Only use as fallback if it's not MetaMask and we're desperate
              // But first, let's check all providers one more time
              const allProviders = (window as any).ethereum?.providers || [];
              if (Array.isArray(allProviders) && allProviders.length > 0) {
                console.log('   Checking all providers in array:', allProviders.length);
                for (const p of allProviders) {
                  const pStr = JSON.stringify(p).toLowerCase();
                  if (pStr.includes('zerion') && !p.isMetaMask) {
                    console.log('✅ Found Zerion in providers array on second check:', p);
                    provider = p;
                    break;
                  }
                }
              }
              if (!provider) {
                provider = ethereumProvider;
              }
            }
          }
        }
        
        // Final fallback - but don't use MetaMask for Zerion
        if (!provider) {
          const fallbackProvider = walletProviders["Ethereum Wallet"] ?? (window as any).ethereum;
          // Check if fallback is MetaMask - if so, reject it for Zerion
          if (fallbackProvider && fallbackProvider.isMetaMask) {
            provider = undefined;
          } else {
            provider = fallbackProvider;
          }
        }
          
        if (provider) {
             
          // Check if it's a Proxy by checking the string representation (safer than instanceof)
          const providerStr = String(provider);
          const isProxy = providerStr.includes('Proxy') || providerStr.includes('[object Proxy]');
          
          // Try to inspect Proxy target if it's a Proxy
          if (isProxy) {
            try {
              // Try to get the target through various possible properties
              const target = (provider as any).target || (provider as any)._target || (provider as any).__target;
              if (target) {
                         } else {
                console.log('Could not access Proxy target (may be protected)');
              }
            } catch (e) {
              console.log('Could not inspect Proxy target:', e);
            }
          }
          
          // Check if this provider has any Zerion-related properties
          try {
            const allProps = Object.getOwnPropertyNames(provider);
            const zerionProps = allProps.filter(p => p.toLowerCase().includes('zerion'));
            if (zerionProps.length > 0) {
              console.log('✅ Found Zerion-related properties:', zerionProps);
            } else {
              // Check which wallet this actually is
              const isMetaMask = (provider as any).isMetaMask;
              const isRabby = (provider as any).isRabby;
              const isCoinbase = (provider as any).isCoinbaseWallet;
              
              if (isMetaMask) {
                console.log('⚠️ This provider is MetaMask, not Zerion.');
              } else if (isRabby) {
                console.log('⚠️ This provider is Rabby, not Zerion.');
              } else if (isCoinbase) {
                console.log('⚠️ This provider is Coinbase Wallet, not Zerion.');
              } else {
                console.log('⚠️ No Zerion-related properties found. This provider might be MetaMask or another wallet.');
              }
              console.log('💡 Tip: If Zerion is installed, you may need to make it the primary wallet in your browser settings.');
            }
          } catch (e) {
            console.log('Could not inspect provider properties:', e);
          }
        }
      } else {
        provider =
          walletProviders[walletName] ??
          walletProviders["Ethereum Wallet"] ??
          (window as any).ethereum;
      }

      if (!provider || typeof provider.request !== "function") {
        if (walletName === "Zerion") {
          console.error('❌ Zerion provider not found or invalid');
          console.error('   Provider:', provider);
          console.error('   Has request function:', provider && typeof provider.request === "function");
          
          // Last resort: try to find Zerion in all possible locations
          const lastResortZerion = 
            (window as any).zerion ||
            (window as any).zerionWallet ||
            (Array.isArray((window as any).ethereum?.providers) 
              ? (window as any).ethereum.providers.find((p: any) => {
                  if (!p || p.isMetaMask) return false;
                  const str = JSON.stringify(p).toLowerCase();
                  return str.includes('zerion');
                })
              : undefined);
          
          if (lastResortZerion && typeof lastResortZerion.request === "function") {
            console.log('✅ Found Zerion on last resort check');
            provider = lastResortZerion;
          } else {
            // For Zerion, don't fallback to MetaMask - show error instead
            const ethereumProvider = (window as any).ethereum;
            if (ethereumProvider && ethereumProvider.isMetaMask) {
              console.error('❌ Zerion not found. MetaMask is detected but cannot be used for Zerion connection.');
              throw new Error('Zerion wallet not detected. Please make sure Zerion extension is installed and enabled. If you have multiple wallets, you may need to set Zerion as the primary wallet in your browser.');
            } else if (ethereumProvider && typeof ethereumProvider.request === "function") {
              // Only use if it's not MetaMask
              provider = ethereumProvider;
              console.log('✅ Using window.ethereum as Zerion provider (not MetaMask)');
            } else {
              console.error('❌ Zerion provider not available');
              throw new Error('Zerion wallet not detected. Please make sure Zerion extension is installed and enabled.');
            }
          }
        }
        
        if (!provider || typeof provider.request !== "function") {
          if (isMobile) {
            // On mobile, guide user to open in wallet browser
            const walletLinks: Record<string, string> = {
              "MetaMask": "https://metamask.app.link/dapp/" + window.location.href.replace(/^https?:\/\//, ''),
              "Coinbase Wallet": "https://go.cb-w.com/dapp?cb_url=" + encodeURIComponent(window.location.href),
              "Trust Wallet": "https://link.trustwallet.com/open_url?coin_id=60&url=" + encodeURIComponent(window.location.href),
              "Zerion": "https://wallet.zerion.io/wc?uri=" + encodeURIComponent(window.location.href),
            };
            
            const deepLink = walletLinks[walletName];
            if (deepLink) {
              toast({
                title: `Open in ${walletName}`,
                description: `Opening ${walletName} app...`,
              });
              window.location.href = deepLink;
              return;
            }
          }
          
          throw new Error(`${walletName} not detected. ${isMobile ? 'Please open this page in your wallet browser or install ' + walletName : 'Please install the browser extension.'}`);
        }
      }

      // Final check: If user clicked Zerion but provider is MetaMask, reject it
      if (walletName === "Zerion" && provider && (provider as any).isMetaMask) {
        throw new Error('Zerion wallet not detected. MetaMask is currently active. Please install Zerion extension or set it as your primary wallet.');
      }
      
      accounts = await provider.request({
        method: "eth_requestAccounts",
      });
      
      
      if (accounts.length > 0) {
        // Store both the wallet address and name
        const walletAddress = accounts[0];
        setConnectedWallet(walletAddress);
        setConnectedWalletName(walletName);
        
        // Save to localStorage for persistence
        localStorage.setItem('coinflip_connectedWallet', walletAddress);
        localStorage.setItem('coinflip_connectedWalletName', walletName);
        
        setShowWalletModal(false);
        toast({
          title: "Wallet Connected",
          description: `Successfully connected to ${walletName}`,
        });
      } else {
        toast({
          title: "No Accounts",
          description: "No accounts found in the wallet",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      
      // Handle specific error cases
      if (error.code === 4001) {
        toast({
          title: "Connection Rejected",
          description: "User rejected the connection request",
          variant: "destructive",
        });
      } else if (error.code === -32002) {
        toast({
          title: "Connection Pending",
          description: "Connection request already pending",
          variant: "destructive",
        });
      } else {
        const errorMessage =
          typeof error?.message === "string" && error.message.trim().length > 0
            ? error.message
            : `${walletName} is not installed or not detected. Please install the wallet extension first.`;

        toast({
          title: "Connection Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  };

  const musicTracks = [
    { name: "50 Cent - In Da Club", file: "50 Cent - In Da Club.mp3" },
    { name: "Bon Jovi - It's My Life", file: "Bon Jovi - It's My Life.mp3" },
    { name: "Crazy Frog - Axel F", file: "Crazy Frog - Axel F.mp3" },
    { name: "In The End", file: "In The End.mp3" },
    { name: "Laura Branigan - Self Control", file: "Laura Branigan - Self Control.mp3" }
  ];

  const desktopApps = [
    { icon: TrashBinIcon, label: "Trash", id: "trash" },
    { icon: ReferralIcon, label: "Referral", id: "referral" },
    { icon: PhotosAlbum, label: "Photos Album", id: "dashboard" },
    { icon: Winamp, label: "Music Player", id: "winamp" },
    { icon: infoIcon, label: "Info", id: "info" },
    { icon: LeaderboardIcon, label: "Onchain Leaderboard", id: "leaderboard" },
    { icon: Coinflip, label: "COINFLIP", id: "mint" },
    { icon: StakeIcon, label: "My Stake", id: "Stakes" },
  ];

  const handleIconClick = (id: string) => {
    setOpenWindow(id);
  };

  const renderWindowContent = (id: string) => {
    const content: Record<string, { title: string; body: JSX.Element }> = {
      chat: {
        title: "Chat",
        body: (
          <div className="space-y-1.5 sm:space-y-4">
            <h2 className="text-base sm:text-2xl font-bold font-futuristic text-gradient-cyan">AI Chat Assistant</h2>
            <p className="text-xs sm:text-base font-cyber text-gradient-orange">Connect with our AI-powered chat system to get help.</p>
            <div className="win98-border-inset p-2 sm:p-4 min-h-[120px] sm:min-h-[200px]">
              <p className="text-[10px] sm:text-sm font-retro text-muted-foreground">Chat interface coming soon...</p>
            </div>
          </div>
        ),
      },
      leaderboard: {
        title: "Onchain Leaderboard",
        body: (
          <div className="space-y-1.5 sm:space-y-4">
            {connectedWallet ? (
              <Leaderboard 
                connectedWallet={connectedWallet}
                connectedWalletName={connectedWalletName}
                walletProviders={walletProviders} 
              />
            ) : (
              <div className="text-center space-y-2 sm:space-y-4">
                <h2 className="text-base sm:text-2xl font-bold font-military text-gradient-emerald">
                  🏆 Onchain Leaderboard 🏆
                </h2>
                <p className="text-xs sm:text-base font-cyber text-gradient-red">
                  Connect your wallet to view the leaderboard!
                </p>
                <div className="win98-border p-2 sm:p-4 bg-secondary">
                  <p className="text-center text-xs sm:text-lg font-pixel">Connect Wallet Required</p>
                  <p className="text-center text-[10px] sm:text-sm mt-1.5 sm:mt-2 font-retro">
                    Click the wallet icon in the taskbar to connect
                  </p>
                </div>
              </div>
            )}
          </div>
        ),
      },
      mint: {
        title: "Coin Flip",
        body: (
          <div className="space-y-1.5 sm:space-y-4">
            {connectedWallet ? (
              <CoinFlip 
                connectedWallet={connectedWallet} 
                connectedWalletName={connectedWalletName}
                walletProviders={walletProviders} 
              />
            ) : (
              <div className="text-center space-y-2 sm:space-y-4">
                <h2 className="text-base sm:text-2xl font-bold font-military text-gradient-emerald">
                  🪙 Coin Flip Game 🪙
                </h2>
                <p className="text-xs sm:text-base font-cyber text-gradient-red">
                  Connect your wallet to start playing!
                </p>
                <div className="win98-border p-2 sm:p-4 bg-secondary">
                  <p className="text-center text-xs sm:text-lg font-pixel">Connect Wallet Required</p>
                  <p className="text-center text-[10px] sm:text-sm mt-1.5 sm:mt-2 font-retro">
                    Click the wallet icon in the taskbar to connect
                  </p>
                </div>
              </div>
            )}
          </div>
        ),
      },
      Stakes: {
        title: "My Stake",
        body: (
          <div className="space-y-2 sm:space-y-4">
            {connectedWallet ? (
              <NFTStaking
                connectedWallet={connectedWallet}
                connectedWalletName={connectedWalletName}
                walletProviders={walletProviders}
              />
            ) : (
              <div className="text-center space-y-2 sm:space-y-4">
                <h2 className="text-lg sm:text-2xl font-bold font-military text-gradient-emerald">
                  🎮 NFT Staking 🎮
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
            )}
          </div>
        ),
      },
      dashboard: {
        title: "Photos",
        body: (
          <div className="space-y-1.5 sm:space-y-4">
            <h2 className="text-base sm:text-2xl font-bold font-bold-gaming text-gradient-blue">Photo Album</h2>
            <p className="text-xs sm:text-base font-cyber text-gradient-green">Browse through your collection of memories and adventures.</p>
            <div className="win98-border-inset p-1.5 sm:p-4 min-h-[150px] sm:min-h-[300px] overflow-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-4">
                {[
                  { src: EiffelImage, name: "Eiffel Tower", alt: "2000s Eiffel Tower" },
                  { src: HawaiiImage, name: "Hawaii", alt: "Hawaii Beach" },
                  { src: RioImage, name: "Rio", alt: "Rio de Janeiro" },
                  { src: RomeImage, name: "Rome", alt: "Ancient Rome" },
                  { src: ShaolinImage, name: "Shaolin", alt: "Shaolin Temple" },
                ].map((photo, index) => (
                  <div key={index} className="win98-border p-0.5 sm:p-2 hover:bg-secondary cursor-pointer group touch-target">
                    <img 
                      src={photo.src} 
                      alt={photo.alt}
                      className="w-full h-16 sm:h-24 object-cover mb-0.5 sm:mb-2"
                      onClick={() => setShowImageModal({ src: photo.src, alt: photo.alt })}
                    />
                    <p className="text-[9px] sm:text-xs font-pixel text-center text-muted-foreground group-hover:text-foreground leading-tight">
                      {photo.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ),
      },
      winamp: {
        title: "Music Player",
        body: (
          <div className="space-y-1.5 sm:space-y-4">
            <h2 className="text-base sm:text-2xl font-bold font-army text-gradient-orange">Music Player</h2>
            <p className="text-xs sm:text-base font-cyber text-gradient-purple">Play your favorite tunes while gaming! Customize your audio experience.</p>
            
            {/* Music Player */}
            <div className="win98-border-inset p-1.5 sm:p-4">
              <div className="text-center space-y-1.5 sm:space-y-4">
                <div className="text-3xl sm:text-6xl">🎵</div>
                <p className="text-xs sm:text-base font-pixel text-gradient-cyan">Music Player</p>
                <p className="text-[10px] sm:text-base font-retro text-muted-foreground leading-tight px-1">
                  {currentTrack ? `Now Playing: ${currentTrack}` : "Select a track to play"}
                </p>
                
                {/* Volume Control */}
                <div className="win98-border p-1.5 sm:p-3 bg-secondary">
                  <div className="flex items-center justify-center space-x-1.5 sm:space-x-2 mb-1.5 sm:mb-2">
                    <span className="text-[10px] sm:text-sm font-pixel text-blue-500">Volume:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => {
                        const newVolume = parseFloat(e.target.value);
                        setVolume(newVolume);
                        if (audioRef) {
                          audioRef.volume = newVolume;
                        }
                      }}
                      className="w-16 sm:w-32 touch-target"
                    />
                    <span className="text-[10px] sm:text-sm font-pixel text-blue-500">{Math.round(volume * 100)}%</span>
                  </div>
                </div>
                
                <div className="win98-border p-1.5 sm:p-3 bg-secondary">
                  <div className="flex items-center justify-center space-x-1.5 sm:space-x-2">
                    <button 
                      className="win98-border-inset p-1.5 sm:p-1 text-xs font-pixel text-blue-500 hover:bg-gray-200 touch-target min-h-[36px] min-w-[36px]"
                      onClick={() => {
                        if (audioRef && currentTrack) {
                          const currentIndex = musicTracks.findIndex(track => track.name === currentTrack);
                          const prevIndex = currentIndex > 0 ? currentIndex - 1 : musicTracks.length - 1;
                          const prevTrack = musicTracks[prevIndex];
                          
                          audioRef.src = `/winamp/${prevTrack.file}`;
                          audioRef.volume = volume;
                          audioRef.play();
                          setCurrentTrack(prevTrack.name);
                          setIsPlaying(true);
                        }
                      }}
                    >
                      ⏮
                    </button>
                    <button 
                      className="win98-border-inset p-1.5 sm:p-1 text-xs font-pixel text-blue-500 hover:bg-gray-200 touch-target min-h-[36px] min-w-[36px]"
                      onClick={() => {
                        if (audioRef) {
                          if (isPlaying) {
                            audioRef.pause();
                            setIsPlaying(false);
                          } else {
                            audioRef.volume = volume;
                            audioRef.play();
                            setIsPlaying(true);
                          }
                        }
                      }}
                    >
                      {isPlaying ? "⏸" : "▶"}
                    </button>
                    <button 
                      className="win98-border-inset p-1.5 sm:p-1 text-xs font-pixel text-blue-500 hover:bg-gray-200 touch-target min-h-[36px] min-w-[36px]"
                      onClick={() => {
                        if (audioRef && currentTrack) {
                          const currentIndex = musicTracks.findIndex(track => track.name === currentTrack);
                          const nextIndex = currentIndex < musicTracks.length - 1 ? currentIndex + 1 : 0;
                          const nextTrack = musicTracks[nextIndex];
                          
                          audioRef.src = `/winamp/${nextTrack.file}`;
                          audioRef.volume = volume;
                          audioRef.play();
                          setCurrentTrack(nextTrack.name);
                          setIsPlaying(true);
                        }
                      }}
                    >
                      ⏭
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Playlist */}
            <div className="win98-border-inset p-1.5 sm:p-4 min-h-[120px] sm:min-h-[200px] overflow-auto">
              <h3 className="text-xs sm:text-base font-bold font-military text-gradient-blue mb-1.5 sm:mb-3">Playlist</h3>
              <div className="space-y-1 sm:space-y-2">
                {musicTracks.map((track, index) => (
                  <div 
                    key={index} 
                    className={`win98-border p-1.5 sm:p-3 flex items-center justify-between cursor-pointer hover:bg-secondary touch-target min-h-[44px] ${
                      currentTrack === track.name ? 'bg-accent text-white' : ''
                    }`}
                    onClick={() => {
                      if (audioRef) {
                        audioRef.src = `/winamp/${track.file}`;
                        audioRef.volume = volume;
                        audioRef.play();
                        setCurrentTrack(track.name);
                        setIsPlaying(true);
                      }
                    }}
                  >
                    <div className="flex items-center space-x-1.5 sm:space-x-2 text-blue-500 min-w-0 flex-1">
                      <span className="text-xs sm:text-sm font-pixel text-blue-500 flex-shrink-0">{index + 1}.</span>
                      <span className="text-xs sm:text-base font-retro text-blue-500 truncate">{track.name}</span>
                    </div>
                    <button 
                      className="text-xs sm:text-sm font-pixel text-blue-500 touch-target min-w-[32px] flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (audioRef) {
                          if (currentTrack === track.name && isPlaying) {
                            audioRef.pause();
                            setIsPlaying(false);
                          } else {
                            audioRef.src = `/winamp/${track.file}`;
                            audioRef.volume = volume;
                            audioRef.play();
                            setCurrentTrack(track.name);
                            setIsPlaying(true);
                          }
                        }
                      }}
                    >
                      {currentTrack === track.name && isPlaying ? "⏸" : "▶"}
                    </button>
                </div>
              ))}
              </div>
            </div>
          </div>
        ),
      },
      trash: {
        title: "Trash",
        body: (
          <div className="space-y-2 sm:space-y-4">
            <h2 className="text-lg sm:text-2xl font-bold font-military text-gradient-red">Trash Bin</h2>
            <p className="text-sm sm:text-base font-retro text-gradient-yellow">Manage your deleted files and clean up your desktop workspace.</p>
            <div className="win98-border-inset p-2 sm:p-4 min-h-[150px] sm:min-h-[200px] overflow-auto">
              <div className="text-center space-y-2 sm:space-y-4">
                <div className="text-4xl sm:text-6xl">🗑️</div>
                <p className="text-sm sm:text-base font-pixel text-gradient-orange">Trash Bin</p>
                <p className="text-xs sm:text-sm font-retro text-muted-foreground">Found some interesting content...</p>
                
                {/* Gamble Shit Image */}
                <div className="win98-border p-2 sm:p-3 bg-secondary">
                  <img 
                    src={gambleShitImage} 
                    alt="Gamble Content" 
                    className="w-full h-auto max-h-[200px] object-contain mx-auto"
                  />
                  <p className="text-xs sm:text-sm font-pixel text-gradient-cyan mt-2">Gamble Content Found</p>
                </div>
                
                <div className="win98-border p-2 sm:p-3 bg-secondary">
                  <div className="flex items-center justify-center space-x-2">
                    <button className="win98-border-inset p-1 text-xs font-pixel">Empty Trash</button>
                    <button className="win98-border-inset p-1 text-xs font-pixel">Restore All</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      roadmap: {
        title: "Roadmap",
        body: (
          <div className="space-y-2 sm:space-y-4">
            <h2 className="text-lg sm:text-2xl font-bold font-futuristic text-gradient-purple">Technical Whitepaper</h2>
            <p className="text-sm sm:text-base font-cyber text-gradient-cyan">Detailed technical documentation and project specifications</p>
            <div className="win98-border-inset p-2 sm:p-4 min-h-[200px] sm:min-h-[300px] overflow-auto">
              <div className="space-y-2 sm:space-y-3">
                <p className="text-xs sm:text-sm font-cyber text-muted-foreground">
                  📄 <strong className="font-bold-gaming text-gradient-blue">Mirac Gaming Ecosystem Whitepaper</strong>
                </p>
                <div className="win98-border p-2 sm:p-3 bg-secondary">
                  <div className="text-xs sm:text-sm font-retro leading-relaxed whitespace-pre-wrap text-black">
                    BOINK is a retro onchain arcade built for fast, fair games and NFT-native rewards.
                    Coin Flip delivers provably fair outcomes with onchain settlement and transparent history.
                    NFT Staking lets you lock ERC-721s to earn BOO and claim anytime.
                    Next up: multi-game arcade modes, seasonal leaderboards, and rarity-based perks.
                  </div>
                </div>
                <div className="text-center">
                  <a 
                    href="/whitepaper.txt" 
                    download="Mirac_Whitepaper.txt"
                    className="inline-block px-3 py-1 bg-accent text-white text-xs font-pixel win98-border hover:win98-border-inset"
                  >
                    📥 Download Full Document
                  </a>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      whitepaper: {
        title: "Whitepaper",
        body: (
          <div className="space-y-2 sm:space-y-4">
            <h2 className="text-lg sm:text-2xl font-bold font-military text-gradient-emerald">Technical Whitepaper</h2>
            <p className="text-sm sm:text-base font-retro text-gradient-orange">Detailed technical documentation and project specifications</p>
            <div className="win98-border-inset p-2 sm:p-4 min-h-[200px] sm:min-h-[300px] overflow-auto">
              <div className="space-y-2 sm:space-y-3">
                <p className="text-xs sm:text-sm font-cyber text-muted-foreground">
                  📄 <strong className="font-bold-gaming text-gradient-blue">Mirac Gaming Ecosystem Whitepaper</strong>
                </p>
                <div className="win98-border p-2 sm:p-3 bg-secondary">
                  <div className="text-xs sm:text-sm font-retro leading-relaxed whitespace-pre-wrap text-black">
                    BOINK is a retro onchain arcade built for fast, fair games and NFT-native rewards.
                    Coin Flip delivers provably fair outcomes with onchain settlement and transparent history.
                    NFT Staking lets you lock ERC-721s to earn BOO and claim anytime.
                    Next up: multi-game arcade modes, seasonal leaderboards, and rarity-based perks.
                  </div>
                </div>
                <div className="text-center">
                  <a 
                    href="/whitepaper.txt" 
                    download="Mirac_Whitepaper.txt"
                    className="inline-block px-3 py-1 bg-accent text-white text-xs font-pixel win98-border hover:win98-border-inset"
                  >
                    📥 Download Full Document
                  </a>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      info: {
        title: "Info",
        body: (
          <div className="space-y-2 sm:space-y-4">
            <h2 className="text-lg sm:text-2xl font-bold font-futuristic text-gradient-purple">Information Center</h2>
            <p className="text-sm sm:text-base font-cyber text-gradient-cyan">Access project documentation and roadmap.</p>
            
            {/* Whitepaper Section */}
            <div className="win98-border-inset p-2 sm:p-4">
              <h3 className="text-sm sm:text-base font-bold font-military text-gradient-blue mb-2 sm:mb-3">📄 Whitepaper</h3>
              <div className="win98-border p-2 sm:p-3 bg-secondary">
                <div className="text-xs text-black sm:text-sm font-retro leading-relaxed whitespace-pre-wrap max-h-32 sm:max-h-40 overflow-auto">
                  {whitepaperContent}
                </div>
              </div>
              <div className="text-center mt-2">
                <a 
                  href="/whitepaper.txt" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-3 py-1 bg-accent text-white text-xs font-pixel win98-border hover:win98-border-inset"
                >
                  📥 Open in New Tab
                </a>
              </div>
            </div>

            {/* Roadmap Section */}
            <div className="win98-border-inset p-2 sm:p-4">
              <h3 className="text-sm sm:text-base font-bold font-military text-gradient-green mb-2 sm:mb-3">🗺️ Roadmap</h3>
              <div className="win98-border p-2 sm:p-3 bg-secondary">
                <img 
                  src="/ROADMAP.png" 
                  alt="Project Roadmap" 
                  className="w-full h-auto max-h-[300px] object-contain cursor-pointer"
                  onClick={() => setShowImageModal({ src: "/ROADMAP.png", alt: "Project Roadmap" })}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <p className="text-center text-xs sm:text-sm font-pixel text-gradient-purple mt-2">Click image to view larger</p>
            </div>
          </div>
        ),
      },
      referral: {
        title: "Referral",
        body: (
          <div className="space-y-2 sm:space-y-4">
            {connectedWallet ? (
              <Referral 
                connectedWallet={connectedWallet}
                connectedWalletName={connectedWalletName}
                walletProviders={walletProviders}
                pendingRefCode={pendingRefCode}
                onRefCodeUsed={() => {
                  setPendingRefCode(null);
                  // Clean up URL if needed
                  const url = new URL(window.location.href);
                  url.searchParams.delete("refCode");
                  window.history.replaceState({}, "", url.toString());
                }}
              />
            ) : (
              <div className="text-center space-y-4">
                <h2 className="text-lg sm:text-2xl font-bold font-military text-gradient-emerald">
                  🎁 Referral System 🎁
                </h2>
                <p className="text-sm sm:text-base font-cyber text-gradient-red">
                  Connect your wallet to use the referral system!
                </p>
                <div className="win98-border p-4 bg-secondary">
                  <p className="text-center text-sm sm:text-lg font-pixel">Connect Wallet Required</p>
                  <p className="text-center text-xs sm:text-sm mt-2 font-retro">
                    Click the wallet icon in the taskbar to connect
                  </p>
                </div>
              </div>
            )}
          </div>
        ),
      },
    };

    return content[id] || { title: "Window", body: <p>Content not found</p> };
  };

  const renderWalletModal = () => {
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    const walletConfigs = [
      { name: 'MetaMask', icon: '🦊', color: 'bg-orange-500' },
      { name: 'Rabby Wallet', icon: 'R', color: 'bg-blue-400' },
      { name: 'Phantom', icon: '👻', color: 'bg-purple-500' },
      { name: 'Backpack', icon: '🎒', color: 'bg-red-500' },
      { name: 'Coinbase Wallet', icon: 'C', color: 'bg-blue-600' },
      { name: 'Zerion', icon: 'Z', color: 'bg-indigo-600' },
    ];
    
    // Always include Zerion in the list (even if not auto-detected)
    // Zerion extension might not expose itself until user interaction
    const installedWallets = walletConfigs
      .filter(wallet => {
        if (wallet.name === 'Zerion') {
          // Always show Zerion - let user try to connect (will work if extension is installed)
          return true;
        }
        return detectedWallets.includes(wallet.name);
      })
      .map(wallet => ({ ...wallet, available: true }));

    // On mobile, show MetaMask even if not detected (will use deep link)
    const mobileWallets = isMobile && installedWallets.length === 0 ? [
      { name: 'MetaMask', icon: '🦊', color: 'bg-orange-500', available: true },
      { name: 'Coinbase Wallet', icon: 'C', color: 'bg-blue-600', available: true },
      { name: 'Trust Wallet', icon: '💙', color: 'bg-blue-500', available: true },
    ] : [];

    const recommendedWallets = [
      { name: 'WalletConnect', available: true, icon: 'W', color: 'bg-blue-400', description: 'Scan QR code' },
    ];

    return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-300 win98-border w-[min(95vw,360px)] sm:w-[min(80vw,480px)] max-h-[95vh] sm:max-h-[80vh] flex flex-col shadow-2xl box-border overflow-hidden">
        {/* Title Bar */}
        <div className="h-8 sm:h-8 bg-gray-300 win98-border-inset flex items-center justify-between px-2 sm:px-2 overflow-hidden">
          <span className="text-black font-bold text-xs sm:text-sm font-military truncate flex-1 mr-1 sm:mr-2">
            Connect a Wallet
          </span>
          <button
            onClick={() => setShowWalletModal(false)}
            className="h-7 w-7 sm:h-6 sm:w-6 win98-border flex items-center justify-center hover:bg-gray-400 flex-shrink-0 touch-target min-h-[44px] min-w-[44px]"
          >
            <span className="text-sm sm:text-xs font-bold font-pixel text-gray-700">×</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 bg-gray-300 p-3 sm:p-4 overflow-y-auto min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Mobile Instructions */}
          {isMobile && installedWallets.length === 0 && (
            <div className="win98-border bg-yellow-100 p-2 sm:p-3 mb-2 sm:mb-4">
              <p className="text-[10px] sm:text-xs font-retro text-gray-800 leading-tight">
                📱 <strong>Mobile User?</strong> Click a wallet below to open this page in that wallet's browser.
              </p>
            </div>
          )}
          
          {/* Installed Section */}
            {installedWallets.length > 0 && (
          <div className="space-y-2 sm:space-y-3">
                <h3 className="text-blue-600 font-medium text-xs sm:text-sm font-futuristic">
                  Detected Wallets ({installedWallets.length})
                </h3>
            <div className="space-y-1.5 sm:space-y-2">
                  {installedWallets.map((wallet) => (
              <div 
                      key={wallet.name}
                className="win98-border-inset p-3 sm:p-3 flex items-center gap-2.5 sm:gap-3 hover:bg-gray-100 cursor-pointer touch-target min-h-[52px] sm:min-h-[44px]"
                      onClick={() => handleWalletConnect(wallet.name)}
              >
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 ${wallet.color} flex items-center justify-center win98-border flex-shrink-0`}>
                        <span className="text-white text-[10px] sm:text-xs font-bold">{wallet.icon}</span>
                </div>
                      <span className="text-xs sm:text-sm font-medium text-black font-cyber flex-1 truncate">{wallet.name}</span>
                      <div className="ml-auto w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
              </div>
                  ))}
                </div>
              </div>
            )}
          
          {/* Mobile Wallets Section */}
          {mobileWallets.length > 0 && (
            <div className="space-y-2 sm:space-y-3 mt-4 sm:mt-6">
              <h3 className="text-blue-600 font-medium text-xs sm:text-sm font-futuristic">
                Open in Wallet App
              </h3>
              <div className="space-y-1.5 sm:space-y-2">
                {mobileWallets.map((wallet) => (
                  <div 
                    key={wallet.name}
                    className="win98-border-inset p-3 sm:p-3 flex items-center gap-2.5 sm:gap-3 hover:bg-gray-100 cursor-pointer touch-target min-h-[52px] sm:min-h-[44px]"
                    onClick={() => handleWalletConnect(wallet.name)}
                  >
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 ${wallet.color} flex items-center justify-center win98-border flex-shrink-0`}>
                      <span className="text-white text-[10px] sm:text-xs font-bold">{wallet.icon}</span>
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-black font-cyber flex-1 truncate">{wallet.name}</span>
                    <span className="ml-auto text-[10px] sm:text-xs text-gray-600 flex-shrink-0">→</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Section */}
          <div className="space-y-2 sm:space-y-3 mt-4 sm:mt-6">
              <h3 className="text-gray-600 font-medium text-xs sm:text-sm font-futuristic">Recommended</h3>
            <div className="space-y-1.5 sm:space-y-2">
                {recommendedWallets.map((wallet) => (
                  <div 
                    key={wallet.name}
                    className={`win98-border-inset p-3 sm:p-3 flex items-center gap-2 sm:gap-3 touch-target min-h-[52px] sm:min-h-[44px] ${
                      wallet.available ? 'hover:bg-gray-100 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                    onClick={() => wallet.available ? handleWalletConnect(wallet.name) : null}
                  >
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 ${wallet.color} flex items-center justify-center win98-border flex-shrink-0`}>
                      <span className="text-white text-[10px] sm:text-xs font-bold">{wallet.icon}</span>
                </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs sm:text-sm font-medium text-black font-cyber block truncate">{wallet.name}</span>
                      {(wallet as any).description && (
                        <p className="text-[10px] sm:text-xs text-gray-600 font-retro truncate">{(wallet as any).description}</p>
                      )}
                    </div>
                    {!wallet.available && (
                      <span className="ml-auto text-[10px] sm:text-xs text-gray-500 font-retro flex-shrink-0">Coming Soon</span>
                    )}
                    {wallet.available && wallet.name === 'WalletConnect' && (
                      <span className="ml-auto text-[10px] sm:text-xs text-blue-600 font-pixel flex-shrink-0">→</span>
                    )}
              </div>
                ))}
              </div>
            </div>

            {/* No wallets detected message */}
            {installedWallets.length === 0 && (
              <div className="mt-4 sm:mt-6 p-2 sm:p-4 win98-border-inset bg-gray-200">
                <p className="text-[10px] sm:text-sm text-black text-center font-retro leading-tight">
                  No wallet extensions detected. Please install a wallet extension like MetaMask, Rabby, or Phantom to continue.
                </p>
          </div>
            )}

          {/* Footer */}
          <div className="mt-4 sm:mt-6 pt-2 sm:pt-4 border-t border-gray-400">
            <p className="text-[10px] sm:text-xs text-black font-retro text-center">
              New to Ethereum wallets?{" "}
              <a href="#" className="text-blue-600 underline hover:text-blue-800 font-cyber">
                Learn More
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
  };



  return (
    <div className="h-screen w-screen flex flex-col overflow-x-hidden overflow-y-auto sm:overflow-hidden">
      {/* Desktop Area */}
      <main className="relative flex-1 overflow-y-auto sm:overflow-hidden">
        {/* Desktop Icons – First 6 in column, last 2 in next column (all devices) */}
        <div className="absolute left-0.5 sm:left-4 top-1 sm:top-2 bottom-12 sm:bottom-12 z-10 pointer-events-auto pr-0.5 sm:pr-1 flex gap-2 sm:gap-3">
          {/* First 6 icons in column */}
          <div className="flex flex-col gap-1.5 sm:gap-1">
            {desktopApps.slice(0, 6).map((app) => (
              <div key={app.id} className="desktop-icon-wrapper">
                <DesktopIcon
                  icon={app.icon}
                  label={app.label}
                  onClick={() => handleIconClick(app.id)}
                />
              </div>
            ))}
          </div>
          
          {/* Last 2 icons in second column */}
          <div className="flex flex-col gap-1.5 sm:gap-1">
            {desktopApps.slice(6).map((app) => (
              <div key={app.id} className="desktop-icon-wrapper">
                <DesktopIcon
                  icon={app.icon}
                  label={app.label}
                  onClick={() => handleIconClick(app.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Centered wallpaper + BOINK - positioned to avoid icon overlap */}
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
          <div className="relative w-full">
            <h1
              className="
                uppercase font-pixel font-bold tracking-wider leading-none text-center
                text-[clamp(1.25rem,12vw,1.75rem)]
                sm:text-[clamp(2.5rem,10vw,4rem)]
                md:text-[clamp(3rem,8vw,5rem)]
                lg:text-[clamp(3.5rem,7vw,6rem)]
                xl:text-[clamp(4rem,6vw,7rem)]
                px-3 sm:px-4
                mt-2 sm:mt-12 md:mt-16 lg:mt-20
                ml-0 sm:ml-0
              "
              style={{
                color: '#815bf9',
                letterSpacing: '0.05em',
                textShadow: '0 2px 0 rgba(0,0,0,0.45)',
              }}
            >
              BOINK
            </h1>
          </div>
        </div>
      </main>

      {/* Window Modal */}
      {openWindow && (
        <Window
          title={renderWindowContent(openWindow).title}
          onClose={() => setOpenWindow(null)}
        >
          {renderWindowContent(openWindow).body}
        </Window>
      )}

      {/* About Window */}
      {showAbout && (
        <Window
          title="About"
          onClose={() => setShowAbout(false)}
        >
          <div>About content coming soon...</div>
        </Window>
      )}

      {/* Connect Wallet Modal */}
      {showWalletModal && renderWalletModal()}

      {/* WalletConnect QR Modal */}
      {showWalletConnectModal && (
        <WalletConnectModal
          projectId="97bac2ccf2dc1d7c79854d5bc2686912"
          onClose={() => setShowWalletConnectModal(false)}
          onConnect={async (provider) => {
            // Handle WalletConnect provider connection
            try {
              const accounts = await provider.request({ method: "eth_accounts" });
              setWalletProviders({ ...walletProviders, WalletConnect: provider });
              // Store both the wallet address and name
              const walletAddress = accounts && accounts.length > 0 ? accounts[0] : null;
              if (walletAddress) {
                setConnectedWallet(walletAddress);
                setConnectedWalletName("WalletConnect");
                
                // Save to localStorage for persistence
                localStorage.setItem('coinflip_connectedWallet', walletAddress);
                localStorage.setItem('coinflip_connectedWalletName', "WalletConnect");
                
                setShowWalletModal(false);
                toast({
                  title: "Wallet Connected",
                  description: "Successfully connected via WalletConnect",
                });
              }
            } catch (error) {
              console.error("Error getting WalletConnect accounts:", error);
            }
          }}
        />
      )}

      {/* Image Modal */}
      {showImageModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-2 sm:p-4 bg-black bg-opacity-75">
          <div className="relative w-[95vw] sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] bg-gray-300 win98-border shadow-2xl overflow-hidden">
            {/* Title Bar */}
            <div className="h-8 sm:h-8 bg-gray-300 win98-border-inset flex items-center justify-between px-2 sm:px-2 overflow-hidden">
              <span className="text-black font-bold text-xs sm:text-sm font-military truncate flex-1 mr-1 sm:mr-2">{showImageModal.alt}</span>
              <button
                onClick={() => setShowImageModal(null)}
                className="h-7 w-7 sm:h-6 sm:w-6 win98-border flex items-center justify-center hover:bg-gray-400 flex-shrink-0 touch-target min-h-[44px] min-w-[44px]"
              >
                <span className="text-sm sm:text-xs font-bold font-pixel">×</span>
              </button>
            </div>
            
            {/* Image Content */}
            <div className="p-3 sm:p-4">
              <img 
                src={showImageModal.src} 
                alt={showImageModal.alt}
                className="max-w-full max-h-[85vh] sm:max-h-[70vh] object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      )}

      {/* Start Menu */}
      {showStartMenu && (
        <StartMenu
          connectedWallet={connectedWallet}
          onClose={() => setShowStartMenu(false)}
          isOpen={showStartMenu}
        />
      )}

      {/* Taskbar */}
        <Taskbar
          onStartClick={() => setShowStartMenu(!showStartMenu)}
          onConnectWalletClick={() => setShowWalletModal(true)}
          onDisconnectWallet={handleWalletDisconnect}
          connectedWallet={connectedWallet}
          blockNumber={blockNumber}
        />
      
      {/* Toast notifications */}
      <Toaster />
    </div>
  );
};

export default Index;
