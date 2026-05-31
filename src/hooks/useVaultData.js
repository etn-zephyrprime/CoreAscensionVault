import React, { useCallback, useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json" assert { type: "json" }; // or use dynamic import if needed

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

      // Fetch core data
      const [
        totalCoreStakedRaw,
        rewardsRemainingRaw,
        blocksRemaining,
        totalCoreBurnedRaw,
        rewardPerBlockRaw,
      ] = await Promise.all([
        staking.totalCoreStaked(),
        staking.rewardsRemainingBySchedule(),
        staking.blocksRemaining(),
        staking.totalCoreBurned(),
        staking.rewardPerBlock(),
      ]);

      const totalCoreStaked = Number(ethers.formatEther(totalCoreStakedRaw));
      const rewardsRemaining = Number(ethers.formatEther(rewardsRemainingRaw));
      const rewardPerBlock = Number(ethers.formatEther(rewardPerBlockRaw));

      const currentApr = totalCoreStaked > 0
        ? ((rewardPerBlock * 6_307_200) / totalCoreStaked) * 100
        : 0;

      let nextVaultData = {
        ...fallbackVault,
        totalCoreStaked,
        rewardsRemaining,
        daysRemaining: Math.floor((Number(blocksRemaining) * 5) / 86400),
        totalCoreBurned: Number(ethers.formatEther(totalCoreBurnedRaw)),
        currentApr,
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
          userShare: totalCoreStaked > 0 
            ? (Number(ethers.formatEther(user[0])) / totalCoreStaked) * 100 
            : 0,
        };
      }

      // === Load Stake History ===
      let history = await fetchStakeHistory(staking, provider);

      // === ROBUST TODAY ENRICHMENT ===
      const todayStr = new Date().toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      const enrichedHistory = history.map(entry => {
        const isToday = entry.date === todayStr;

        return {
          ...entry,
          coreStaked: isToday 
            ? Math.floor(nextVaultData.totalCoreStaked) 
            : (entry.coreStaked || 0),
          
          nftsStaked: isToday 
            ? (nextVaultData.nftCount || 0) 
            : (entry.nftsStaked || 0),

          rewardsRemaining: nextVaultData.rewardsRemaining,
          currentApr: nextVaultData.currentApr,
        };
      });

      nextVaultData.stakeHistory = enrichedHistory;
      
      setVaultData(nextVaultData);
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

  return {
    vaultData,
    reloadVaultData: loadVaultData,
  };
}

// ====================== HISTORY FETCHER ======================
async function fetchStakeHistory(stakingContract, provider) {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vault/stake-history`);
    if (!res.ok) throw new Error("Failed to fetch history");
    
    let cache = await res.json();

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max((cache.lastProcessedBlock || 13853455) + 1, 13853455);

    console.log(`[Frontend] Last backend block: ${cache.lastProcessedBlock} | Current: ${currentBlock}`);

    if (fromBlock > currentBlock) {
      console.log("✅ Using latest history from backend cache");
      return cache.history || [];
    }

    console.log(`🔄 Fetching new events from block ${fromBlock}`);

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();

    const newCoreEvents = await stakingContract.queryFilter(coreFilter, fromBlock, currentBlock);
    const newNftEvents = await stakingContract.queryFilter(nftFilter, fromBlock, currentBlock);

    console.log(`New events: ${newCoreEvents.length} CORE | ${newNftEvents.length} NFT`);

    const newDailyData = await processEvents(newCoreEvents, newNftEvents, provider);

    let updatedHistory = [...(cache.history || [])];

    Object.values(newDailyData).forEach(newDay => {
      const existingIndex = updatedHistory.findIndex(h => h.date === newDay.date);
      if (existingIndex !== -1) {
        updatedHistory[existingIndex].coreStaked = (updatedHistory[existingIndex].coreStaked || 0) + (newDay.coreStaked || 0);
        updatedHistory[existingIndex].nftsStaked = (updatedHistory[existingIndex].nftsStaked || 0) + (newDay.nftsStaked || 0);
      } else {
        updatedHistory.push(newDay);
      }
    });

    updatedHistory.sort((a, b) => a.date.localeCompare(b.date));

    // Send update to backend
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/vault/stake-history/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastProcessedBlock: currentBlock,
          history: updatedHistory
        })
      });
    } catch (e) {
      console.warn("Backend update skipped");
    }

    return updatedHistory;

  } catch (err) {
    console.error("Backend history fetch failed:", err);
    return createFallbackHistory(0, 0);
  }
}

async function processEvents(coreEvents, nftEvents, provider) {
  const dailyData = {};
  const blockCache = new Map();

  for (const event of coreEvents) {
    try {
      let block = blockCache.get(event.blockNumber);
      if (!block) {
        block = await provider.getBlock(event.blockNumber, false);
        blockCache.set(event.blockNumber, block);
      }
      const dayKey = new Date(block.timestamp * 1000).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric'
      });
      if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
      dailyData[dayKey].coreStaked += Number(ethers.formatEther(event.args.amount || 0));
    } catch (e) {}
  }

  for (const event of nftEvents) {
    try {
      let block = blockCache.get(event.blockNumber);
      if (!block) {
        block = await provider.getBlock(event.blockNumber, false);
        blockCache.set(event.blockNumber, block);
      }
      const dayKey = new Date(block.timestamp * 1000).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric'
      });
      if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
      dailyData[dayKey].nftsStaked += 1;
    } catch (e) {}
  }

  return dailyData;
}

function createFallbackHistory(totalCore, totalNfts) {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric' 
  });

  return [
    { date: yesterday, coreStaked: Math.floor(totalCore * 0.7), nftsStaked: Math.floor(totalNfts * 0.8) },
    { date: today, coreStaked: Math.floor(totalCore), nftsStaked: totalNfts || 0 }
  ];
}