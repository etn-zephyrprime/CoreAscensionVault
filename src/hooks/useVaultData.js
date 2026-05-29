import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json";

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

  const loadVaultData = useCallback(async () => {
    try {
      if (!provider) return;

      const staking = new ethers.Contract(
        STAKING_ADDRESS,
        stakingABI,
        provider
      );

      // === Current Snapshot Data ===
      const totalCoreStaked = await staking.totalCoreStaked();
      const rewardsRemaining = await staking.rewardsRemainingBySchedule();
      const blocksRemaining = await staking.blocksRemaining();
      const totalCoreBurned = await staking.totalCoreBurned();
      const rewardPerBlock = await staking.rewardPerBlock();

      const totalCoreStakedNum = Number(ethers.formatEther(totalCoreStaked));
      const rewardPerBlockNum = Number(ethers.formatEther(rewardPerBlock));

      const currentApr =
        totalCoreStakedNum > 0
          ? ((rewardPerBlockNum * 6_307_200) / totalCoreStakedNum) * 100
          : 0;

      let nextVaultData = {
        ...fallbackVault,
        totalCoreStaked: totalCoreStakedNum,
        rewardsRemaining: Number(ethers.formatEther(rewardsRemaining)),
        daysRemaining: Math.floor((Number(blocksRemaining) * 5) / 86400),
        totalCoreBurned: Number(ethers.formatEther(totalCoreBurned)),
        currentApr: currentApr,
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
          penaltyDaysRemaining: 0, // Add your penalty logic if needed
        };
      }

      // === Load Stake History with Polling Support ===
      const history = await fetchStakeHistory(
        staking,
        provider,
        nextVaultData.totalCoreStaked,
        nextVaultData.nftCount || 0
      );

      nextVaultData.stakeHistory = history;

      setVaultData(nextVaultData);
    } catch (err) {
      console.error("loadVaultData failed:", err);
    }
  }, [provider, account]);

  // Initial load + Polling
  useEffect(() => {
    if (!provider) return;

    loadVaultData();

    // Poll every 45 seconds
    const interval = setInterval(() => {
      loadVaultData();
    }, 45 * 1000);

    return () => clearInterval(interval);
  }, [loadVaultData]);

  return {
    vaultData,
    reloadVaultData: loadVaultData,
  };
}

// ====================== HISTORY HELPER ======================
async function fetchStakeHistory(stakingContract, provider, totalCoreStaked, totalNftsStaked = 0) {
  try {
    if (!provider) return createFallbackHistory(totalCoreStaked, totalNftsStaked);

    const currentBlock = await provider.getBlockNumber();
    const CONTRACT_CREATION_BLOCK = 13853455;
    const CHUNK_SIZE = 25;
    const MAX_HISTORY_BLOCKS = 8000;

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

        if (end < currentBlock) await new Promise(r => setTimeout(r, 60));
      } catch (e) {
        console.warn(`Chunk ${start}-${end} skipped`);
      }
    }

    const dailyData = {};
    const blockCache = new Map();

    // Process CORE events
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

    // Process NFT events
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

    // Always include today's data with current totals
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    history = history.filter(h => h.date !== today); // remove old today if exists
    history.push({
      date: today,
      coreStaked: Math.floor(totalCoreStaked),
      nftsStaked: totalNftsStaked
    });

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