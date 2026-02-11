#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🪙 Coin Flip Setup Helper 🪙\n');

const envPath = path.join(process.cwd(), '.env');
const envExamplePath = path.join(process.cwd(), '.env.example');

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('✅ .env file already exists');
  
  // Check if contract address is set
  const envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('VITE_COINFLIP_CONTRACT_ADDRESS=')) {
    const match = envContent.match(/VITE_COINFLIP_CONTRACT_ADDRESS=(.+)/);
    if (match && match[1] && match[1] !== '0x0000000000000000000000000000000000000000') {
      console.log('✅ Contract address is already configured:', match[1]);
    } else {
      console.log('⚠️  Contract address needs to be updated');
    }
  } else {
    console.log('⚠️  VITE_COINFLIP_CONTRACT_ADDRESS not found in .env');
  }
} else {
  console.log('📝 Creating .env file...');
  
  const envContent = `# Coin Flip Contract Configuration
# Replace with your deployed contract address
VITE_COINFLIP_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
`;
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env file created');
}

console.log('\n📋 Next steps:');
console.log('1. Deploy your CoinFlipGasOnly contract');
console.log('2. Update VITE_COINFLIP_CONTRACT_ADDRESS in .env with your contract address');
console.log('3. Restart your development server (npm run dev)');
console.log('\n🎮 Happy flipping!');
