// Wallet provider types
export interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  providers?: EthereumProvider[];
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isPhantom?: boolean;
  isBackpack?: boolean;
  isCoinbaseWallet?: boolean;
  selectedAddress?: string;
  chainId?: string;
}

export interface PhantomProvider {
  connect?: () => Promise<{ publicKey: string }>;
  disconnect?: () => Promise<void>;
  isPhantom?: boolean;
  ethereum?: EthereumProvider;
}

export interface RabbyProvider extends EthereumProvider {
  isRabby?: boolean;
}

export interface BackpackProvider extends EthereumProvider {
  isBackpack?: boolean;
  ethereum?: EthereumProvider;
}

export interface CoinbaseWalletProvider extends EthereumProvider {
  isCoinbaseWallet?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    phantom?: PhantomProvider;
    rabby?: RabbyProvider;
    backpack?: BackpackProvider;
    coinbaseWalletExtension?: CoinbaseWalletProvider;
  }
}
