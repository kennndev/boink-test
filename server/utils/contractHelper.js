import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load ABI from src directory
const ABI_PATH = join(__dirname, '..', '..', 'src', 'coinFlip.json');
const REFERRAL_ABI_PATH = join(__dirname, '..', '..', 'src', 'ReferralRegistry.json');
let coinFlipABI = null;
let referralRegistryABI = null;

try {
  const abiContent = readFileSync(ABI_PATH, 'utf-8');
  coinFlipABI = JSON.parse(abiContent);
} catch (error) {
  console.error('Error loading CoinFlip ABI:', error);
  throw new Error('Failed to load CoinFlip ABI');
}

try {
  const referralAbiContent = readFileSync(REFERRAL_ABI_PATH, 'utf-8');
  referralRegistryABI = JSON.parse(referralAbiContent);
} catch (error) {
  console.error('Error loading ReferralRegistry ABI:', error);
  // Don't throw, referral registry is optional
}

/**
 * Get a contract instance connected to the RPC provider
 */
export function getContractInstance() {
  const RPC_URL = process.env.RPC_URL;
  const CONTRACT_ADDRESS = process.env.COINFLIP_ADDRESS;
  const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || 763373);

  const missingVars = [];
  if (!RPC_URL) missingVars.push('RPC_URL');
  if (!CONTRACT_ADDRESS) missingVars.push('COINFLIP_ADDRESS');
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}. Please set them in Vercel Dashboard → Settings → Environment Variables.`);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, coinFlipABI, provider);

  return { contract, provider };
}

/**
 * Get ERC20 contract instance
 */
export function getERC20Contract(tokenAddress, provider) {
  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function allowance(address owner, address spender) external view returns (uint256)"
  ];
  
  return new ethers.Contract(tokenAddress, erc20Abi, provider);
}

/**
 * Get referral registry contract instance
 */
export function getReferralRegistryInstance() {
  const RPC_URL = process.env.RPC_URL;
  const REFERRAL_REGISTRY_ADDRESS = process.env.REFERRAL_REGISTRY_ADDRESS || process.env.VITE_REFERRAL_REGISTORY_ADDRESS || "0x6C02bb7536d71a69F3d38E448422C80445D26b0d";
  const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || 763373);

  if (!RPC_URL) {
    throw new Error('Missing required environment variable: RPC_URL');
  }

  if (!referralRegistryABI) {
    throw new Error('ReferralRegistry ABI not loaded');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const contract = new ethers.Contract(REFERRAL_REGISTRY_ADDRESS, referralRegistryABI, provider);

  return { contract, provider };
}

export { coinFlipABI, referralRegistryABI };

