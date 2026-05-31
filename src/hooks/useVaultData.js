import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json" assert { type: "json" };

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

      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);

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

      // === FORCE TODAY'S VALUES ===
      const todayStr = new Date().toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      const enrichedHistory = history.map(entry => {
        const isToday = entry.date === todayStr;

        return {
          ...entry,
          coreStaked: isToday ? Math.floor(nextVaultData.totalCoreStaked) : (entry.coreStaked || 0),
          nftsStaked: isToday ? (nextVaultData.nftCount || 0) : (entry.nftsStaked || 0),
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

    return cache.history || [];
  } catch (err) {
    console.error("Backend history fetch failed:", err);
    return [];
  }
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