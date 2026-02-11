// WalletConnect Configuration
export const WALLET_CONNECT_PROJECT_ID = "97bac2ccf2dc1d7c79854d5bc2686912";

export const metadata = {
  name: "Boink Coin Flip",
  description: "Flip a coin and win USDC on Base",
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: ['/boink-logo.png']
};

// Base Sepolia configuration
export const baseSepolia = {
  id: 763373,
  name: 'Ink Sepolia',
  network: 'ink-sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc-gel-sepolia.inkonchain.com'],
    },
    public: {
      http: ['https://rpc-gel-sepolia.inkonchain.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'InkScan',
      url: 'https://explorer-sepolia.inkonchain.com',
    },
  },
  testnet: true,
};

