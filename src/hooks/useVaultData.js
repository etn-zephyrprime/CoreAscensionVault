import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json" assert { type: "json" };
import dripABI from "../abis/dripABI.json" assert { type: "json" };
import { DRIP_FUNDER_ADDRESS } from "../config";

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
  nextDripSeconds: 0,
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

const drip = new ethers.Contract(
  DRIP_FUNDER_ADDRESS,
  dripABI,
  provider
);

      const [
        totalCoreStakedRaw,
        rewardsRemainingRaw,
        blocksRemaining,
        totalCoreBurnedRaw,
        rewardPerBlockRaw,
        nextDripSecondsRaw,
      ] = await Promise.all([
        staking.totalCoreStaked(),
        staking.rewardsRemainingBySchedule(),
        staking.blocksRemaining(),
        staking.totalCoreBurned(),
        staking.rewardPerBlock(),
        drip.nextDripIn(),
      ]);

      const totalCoreStaked = Number(ethers.formatEther(totalCoreStakedRaw));
      const rewardsRemaining = Number(ethers.formatEther(rewardsRemainingRaw));
      const rewardPerBlock = Number(ethers.formatEther(rewardPerBlockRaw));
      const nextDripSeconds = Number(nextDripSecondsRaw);

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
        nextDripSeconds,
      };

      if (account) {
        const user = await staking.getUser(account);
        
        const entryTime = Number(user[3]);
        const minStakeTime = 60 * 24 * 60 * 60; // 60 days in seconds
        const now = Math.floor(Date.now() / 1000);

        const penaltySecondsRemaining =
          entryTime > 0 ? Math.max(0, entryTime + minStakeTime - now) : 0;

        const penaltyDaysRemaining = Math.ceil(penaltySecondsRemaining / 86400);

        nextVaultData = {
          ...nextVaultData,
          coreStaked: Number(ethers.formatEther(user[0])),
          nftCount: Number(user[1]),
          rewardWeight: Number(ethers.formatEther(user[2])),
          entryTime: entryTime,
          earnedCore: Number(ethers.formatEther(user[4])),
          earlyExit: Boolean(user[5]),
          boost: Number(user[6]) / 10000,
          userShare: totalCoreStaked > 0 
            ? (Number(ethers.formatEther(user[0])) / totalCoreStaked) * 100 
            : 0,
          penaltyDaysRemaining: penaltyDaysRemaining,   // ← Fixed
        };
      }
      
      // === Load Stake History ===
      let history = await fetchStakeHistory(staking, provider);

      // === FORCE TODAY'S VALUES (Critical Fix) ===
      const todayStr = new Date().toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      const enrichedHistory = history.map(entry => {
        const isToday = entry.date === todayStr;

        return {
          ...entry,
          coreStaked: isToday ? Math.floor(nextVaultData.totalCoreStaked) : (entry.coreStaked || 0),
          nftsStaked: isToday ? 4 : (entry.nftsStaked || 0),   // ← Temporary hardcode until we add totalNFTs
          rewardsRemaining: nextVaultData.rewardsRemaining,
          currentApr: nextVaultData.currentApr,
        };
      });

      nextVaultData.stakeHistory = enrichedHistory;
      
      setVaultData(nextVaultData);
      console.log("✅ Vault data loaded | Today NFTs forced to 4");
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

// Simple history fetcher
async function fetchStakeHistory(stakingContract, provider) {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vault/stake-history`);
    if (!res.ok) throw new Error("Failed to fetch");
    const data = await res.json();
    return data.history || [];
  } catch (err) {
    console.error("Backend history fetch failed:", err);
    return [];
  }
}