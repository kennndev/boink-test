# NFT Staking Points Integration Guide

## Overview
The staking system awards **100 points per day per staked NFT**. Points are automatically distributed daily at midnight UTC. No manual claiming required!

## Backend Endpoints

### 1. Sync Staking State
```
POST /api/staking/sync/:walletAddress
```
**When to call:** After staking or unstaking NFTs
**What it does:** Syncs database with blockchain, detects new stakes/unstakes, auto-awards points for unstaked NFTs

### 2. Get Staking Info
```
GET /api/staking/info/:walletAddress
```
**When to call:** To display pending points (updates every 30s recommended)
**Response:**
```json
{
  "success": true,
  "data": {
    "stakedCount": 2,
    "pendingPoints": 42,
    "totalPoints": 500,
    "totalWithPending": 542,
    "pointsPerDay": 200,
    "nextDistribution": {
      "timestamp": "2024-01-02T00:00:00.000Z",
      "hoursRemaining": 8
    }
  }
}
```

### 3. Manual Distribution (Admin/Testing)
```
POST /api/staking/distribute-points
```
**When to call:** For testing or manual distribution
**What it does:** Manually triggers the daily points distribution process

### 4. Get Staking History
```
GET /api/staking/history/:walletAddress
```
**When to call:** To show user's staking history

## Frontend Integration Example

### Add to NFTStaking.tsx

```typescript
// Add state for staking points
const [stakingPoints, setStakingPoints] = useState<number>(0);
const [stakingInfo, setStakingInfo] = useState<any>(null);

// Backend API URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Fetch staking info
const fetchStakingInfo = async () => {
  if (!connectedWallet) return;

  try {
    const response = await fetch(`${API_URL}/api/staking/info/${connectedWallet}`);
    const data = await response.json();

    if (data.success) {
      setStakingInfo(data.data);
      setStakingPoints(data.data.pendingPoints);
    }
  } catch (error) {
    console.error('Error fetching staking info:', error);
  }
};

// Sync staking state after stake/unstake
const syncStakingState = async () => {
  if (!connectedWallet) return;

  try {
    const response = await fetch(`${API_URL}/api/staking/sync/${connectedWallet}`, {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      await fetchStakingInfo(); // Refresh info after sync
      toast({ title: "Synced", description: "Staking state updated" });
    }
  } catch (error) {
    console.error('Error syncing staking:', error);
  }
};


// Call after successful stake
const handleStake = async () => {
  // ... existing stake logic ...

  await stakeTx.wait();
  toast({ title: "Staked!", description: `Successfully staked ${tokenIds.length} NFT(s)` });

  // Sync staking state with backend
  await syncStakingState();

  setSelectedNFTs(new Set());
  await refreshData();
};

// Call after successful unstake
const handleUnstake = async () => {
  // ... existing unstake logic ...

  await unstakeTx.wait();
  toast({ title: "Unstaked!", description: `Successfully unstaked ${tokenIds.length} NFT(s)` });

  // Sync staking state (auto-claims points for unstaked NFTs)
  await syncStakingState();

  setSelectedStakedNFTs(new Set());
  await refreshData();
};

// Fetch staking info periodically
useEffect(() => {
  if (!connectedWallet) return;

  fetchStakingInfo(); // Initial fetch

  const interval = setInterval(() => {
    fetchStakingInfo(); // Refresh every 30 seconds
  }, 30000);

  return () => clearInterval(interval);
}, [connectedWallet]);
```

### Add Pending Points UI

```tsx
{/* Pending Staking Points */}
{stakingInfo && stakingInfo.pendingPoints > 0 && (
  <div className="win98-border-inset p-2 sm:p-3 bg-gradient-to-r from-yellow-50 to-orange-50">
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] sm:text-xs font-retro text-gray-600">Pending Points</p>
        <p className="text-[9px] sm:text-[10px] font-retro text-gray-500">
          Auto-awarded daily
        </p>
      </div>
      <p className="text-lg sm:text-xl font-pixel text-orange-600 font-bold">
        {stakingInfo.pendingPoints} points
      </p>
      {stakingInfo.nextDistribution && (
        <p className="text-[9px] sm:text-[10px] font-retro text-gray-600">
          Next distribution in {stakingInfo.nextDistribution.hoursRemaining}h
        </p>
      )}
    </div>
  </div>
)}
```

## Environment Variables

Add to your `.env`:
```
VITE_API_URL=http://localhost:3001
VITE_STAKING_CONTRACT_ADDRESS=0xBE1F446338737E3A9d60fD0a71cf9C53f329E7dd
VITE_RPC_URL=https://rpc-gel-sepolia.inkonchain.com
```

## Flow Diagram

```
User Stakes NFT
      ↓
Frontend: handleStake()
      ↓
Smart Contract: stake()
      ↓
Backend: POST /api/staking/sync/:wallet
      ↓
Database: Create staking record with stakedAt timestamp
      ↓
Points accumulate (100/day/NFT)
      ↓
Frontend: Shows pending points (fetched every 30s)
      ↓
Every Day at Midnight UTC
      ↓
Cron Job: distributeStakingPoints()
      ↓
Database: Award points to all active stakers automatically
      ↓
User unstakes NFT
      ↓
Frontend: handleUnstake()
      ↓
Smart Contract: unstake()
      ↓
Backend: POST /api/staking/sync/:wallet
      ↓
Auto-award any pending points + mark NFT as inactive
```

## Testing Checklist

- [ ] Stake 1 NFT → sync → check database has record
- [ ] Wait 1 hour → check pending points = ~4.17 points
- [ ] Trigger manual distribution → check points awarded automatically
- [ ] Stake 2nd NFT → verify daily rate doubled (200 points/day)
- [ ] Unstake 1 NFT → verify points auto-awarded for that NFT
- [ ] Check leaderboard includes all staking points
- [ ] Verify cron job runs daily at midnight UTC

### Manual Distribution for Testing
Use this endpoint to test without waiting 24 hours:
```bash
curl -X POST http://localhost:3001/api/staking/distribute-points
```

## Database Schema

### Staking Collection
```javascript
{
  walletAddress: "0x1234...",
  tokenId: "42",
  stakedAt: ISODate("2024-01-01T00:00:00Z"),
  lastClaimAt: ISODate("2024-01-01T12:00:00Z"),
  isActive: true,
  unstakedAt: null
}
```

### User Collection (existing)
```javascript
{
  walletAddress: "0x1234...",
  points: 1250,  // Total accumulated points
  // ... other fields
}
```
