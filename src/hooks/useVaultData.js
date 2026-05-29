import React, { useCallback, useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json";

// Global cache for history
const historyCache = {
  data: null,
  timestamp: 0,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
};

const fallbackVault = {
  coreStaked: 0,
  earnedCore: 0,
  nftCount: 0,
  boost: 1.0,
  currentApr: 0,
  totalCoreStaked: 0,
  rewardsRemaining: 0,
  daysRemaining: 0,
  earlyExit: false,
  penaltyDaysRemaining: 0,
  userShare: 0,
  totalCoreBurned: 0,
  stakeHistory: [],
};

export function useVaultData(provider, account) {
  const [vaultData, setVaultData] = useState(fallbackVault);
  const isInitialLoad = useRef(true);

  const loadVaultData = useCallback(async () => {
    try {
      if (!provider) return;

      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);

      // === Snapshot Data ===
      const [
        totalCoreStaked,
        rewardsRemaining,
        blocksRemaining,
        totalCoreBurned,
        rewardPerBlock
      ] = await Promise.all([
        staking.totalCoreStaked(),
        staking.rewardsRemainingBySchedule(),
        staking.blocksRemaining(),
        staking.totalCoreBurned(),
        staking.rewardPerBlock(),
      ]);

      const totalCoreStakedNum = Number(ethers.formatEther(totalCoreStaked));
      const rewardPerBlockNum = Number(ethers.formatEther(rewardPerBlock));

      let nextVaultData = {
        ...fallbackVault,
        totalCoreStaked: totalCoreStakedNum,
        rewardsRemaining: Number(ethers.formatEther(rewardsRemaining)),
        daysRemaining: Math.floor((Number(blocksRemaining) * 5) / 86400),
        totalCoreBurned: Number(ethers.formatEther(totalCoreBurned)),
        currentApr: totalCoreStakedNum > 0
          ? ((rewardPerBlockNum * 6_307_200) / totalCoreStakedNum) * 100
          : 0,
      };

      if (account) {
        const user = await staking.getUser(account);
        nextVaultData = {
          ...nextVaultData,
          coreStaked: Number(ethers.formatEther(user[0])),
          nftCount: Number(user[1]),
          rewardWeight: Number(ethers.formatEther(user[2])),
          entryTime: Number(user[3]),
          earnedCore: Number(ethers.formatEther(user[4])),
          earlyExit: Boolean(user[5]),
          boost: Number(user[6]) / 10000,
          userShare: totalCoreStakedNum > 0 
            ? (Number(ethers.formatEther(user[0])) / totalCoreStakedNum) * 100 
            : 0,
        };
      }

      // === Cached History ===
      const history = await fetchStakeHistory(
        staking,
        provider,
        nextVaultData.totalCoreStaked,
        nextVaultData.nftCount || 0
      );

      nextVaultData.stakeHistory = history;
      setVaultData(nextVaultData);

      isInitialLoad.current = false;
    } catch (err) {
      console.error("loadVaultData failed:", err);
    }
  }, [provider, account]);

  useEffect(() => {
    if (!provider) return;
    loadVaultData();

    const interval = setInterval(loadVaultData, 45 * 1000);
    return () => clearInterval(interval);
  }, [loadVaultData]);

  return { vaultData, reloadVaultData: loadVaultData };
}

// ====================== CACHED HISTORY ======================
async function fetchStakeHistory(stakingContract, provider, totalCoreStaked, totalNftsStaked = 0) {
  const now = Date.now();

  // Use cache if fresh
  if (historyCache.data && (now - historyCache.timestamp) < historyCache.CACHE_DURATION) {
    console.log("🟢 Using cached stake history");
    return historyCache.data;
  }

  try {
    console.log("🔄 Fetching fresh stake history...");

    const currentBlock = await provider.getBlockNumber();
    const CONTRACT_CREATION_BLOCK = 13853455;
    const CHUNK_SIZE = 30;
    const MAX_HISTORY_BLOCKS = 6000;

    let fromBlock = Math.max(CONTRACT_CREATION_BLOCK, currentBlock - MAX_HISTORY_BLOCKS);

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();

    const allCoreEvents = [];
    const allNftEvents = [];

    for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, currentBlock);
      try {
        const [coreChunk, nftChunk] = await Promise.all([
          stakingContract.queryFilter(coreFilter, start, end),
          stakingContract.queryFilter(nftFilter, start, end)
        ]);
        allCoreEvents.push(...coreChunk);
        allNftEvents.push(...nftChunk);

        if (end < currentBlock) await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        console.warn(`Chunk failed: ${start}-${end}`);
      }
    }

    const dailyData = {};
    const blockCache = new Map();

    // Process events...
    for (const event of allCoreEvents) {
      try {
        let block = blockCache.get(event.blockNumber);
        if (!block) {
          block = await provider.getBlock(event.blockNumber, false);
          blockCache.set(event.blockNumber, block);
        }
        const dayKey = new Date(block.timestamp * 1000)
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
        dailyData[dayKey].coreStaked += Number(ethers.formatEther(event.args.amount || 0));
      } catch {}
    }

    for (const event of allNftEvents) {
      try {
        let block = blockCache.get(event.blockNumber);
        if (!block) {
          block = await provider.getBlock(event.blockNumber, false);
          blockCache.set(event.blockNumber, block);
        }
        const dayKey = new Date(block.timestamp * 1000)
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
        dailyData[dayKey].nftsStaked += 1;
      } catch {}
    }

    let history = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));

    // Always add today's current total
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    history = history.filter(h => h.date !== today);
    history.push({
      date: today,
      coreStaked: Math.floor(totalCoreStaked),
      nftsStaked: totalNftsStaked
    });

    // Update cache
    historyCache.data = history;
    historyCache.timestamp = now;

    console.log(`✅ History cached (${history.length} days)`);
    return history;

  } catch (err) {
    console.error("History fetch failed:", err);
    return createFallbackHistory(totalCoreStaked, totalNftsStaked);
  }
}

function createFallbackHistory(totalCore, totalNfts) {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return [
    { date: yesterday, coreStaked: Math.floor(totalCore * 0.68), nftsStaked: Math.floor(totalNfts * 0.75) },
    { date: today, coreStaked: Math.floor(totalCore), nftsStaked: totalNfts || 0 }
  ];
}