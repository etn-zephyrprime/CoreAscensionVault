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
    console.log("🔄 Fetching fresh stake history since deployment...");

    const currentBlock = await provider.getBlockNumber();
    const CONTRACT_CREATION_BLOCK = 13853455;

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();

    const allCoreEvents = [];
    const allNftEvents = [];

    // Fetch in larger but safe chunks
    const CHUNK_SIZE = 80;
    let fromBlock = CONTRACT_CREATION_BLOCK;

    console.log(`Starting full history scan from block ${fromBlock}`);

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, currentBlock);

      try {
        const [coreChunk, nftChunk] = await Promise.all([
          stakingContract.queryFilter(coreFilter, fromBlock, toBlock),
          stakingContract.queryFilter(nftFilter, fromBlock, toBlock)
        ]);

        allCoreEvents.push(...coreChunk);
        allNftEvents.push(...nftChunk);

        console.log(`Chunk ${fromBlock}-${toBlock}: ${coreChunk.length} core, ${nftChunk.length} nft`);

        if (toBlock < currentBlock) {
          await new Promise(r => setTimeout(r, 70));
        }
      } catch (e) {
        console.warn(`Chunk ${fromBlock}-${toBlock} failed`);
      }

      fromBlock = toBlock + 1;
    }

    console.log(`Total events found → Core: ${allCoreEvents.length} | NFT: ${allNftEvents.length}`);

    const dailyData = {};
    const blockCache = new Map();

    // Process all events
    for (const event of allCoreEvents) {
      try {
        let block = blockCache.get(event.blockNumber);
        if (!block) {
          block = await provider.getBlock(event.blockNumber, false);
          blockCache.set(event.blockNumber, block);
        }

        const date = new Date(block.timestamp * 1000);
        const dayKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!dailyData[dayKey]) {
          dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
        }
        dailyData[dayKey].coreStaked += Number(ethers.formatEther(event.args.amount || 0));
      } catch (e) {}
    }

    for (const event of allNftEvents) {
      try {
        let block = blockCache.get(event.blockNumber);
        if (!block) {
          block = await provider.getBlock(event.blockNumber, false);
          blockCache.set(event.blockNumber, block);
        }

        const date = new Date(block.timestamp * 1000);
        const dayKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
        dailyData[dayKey].nftsStaked += 1;
      } catch (e) {}
    }

    let history = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));

    // Always ensure we have today's data with current total
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

    console.log("✅ Final history data:", history);
    return history;

  } catch (err) {
    console.error("History fetch failed:", err);
    return createFallbackHistory(totalCoreStaked, totalNftsStaked);
  }
}