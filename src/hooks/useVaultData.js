import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS, DRIP_FUNDER_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json" assert { type: "json" };
import dripABI from "../abis/dripABI.json" assert { type: "json" };

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
  const [loading, setLoading] = useState(false);

  const loadVaultData = useCallback(async () => {
    if (!provider) return;

    setLoading(true);
    try {
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

      // === Fetch Global Data ===
      const [
        totalCoreStakedRaw,
        rewardsRemainingRaw,
        blocksRemainingRaw,
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

      const currentApr =
        totalCoreStaked > 0
          ? ((rewardPerBlock * 6_307_200) / totalCoreStaked) * 100
          : 0;

      const daysRemaining = Math.floor(
        (Number(blocksRemainingRaw) * 5) / 86400
      );

      let nextVaultData = {
        ...fallbackVault,
        totalCoreStaked,
        rewardsRemaining,
        daysRemaining,
        totalCoreBurned: Number(ethers.formatEther(totalCoreBurnedRaw)),
        currentApr,
        nextDripSeconds,
      };

      // === Fetch User Data (if connected) ===
      if (account) {
        const user = await staking.getUser(account);

        const entryTime = Number(user[3]);
        const now = Math.floor(Date.now() / 1000);
        const minStakeTime = 60 * 24 * 60 * 60; // 60 days

        const penaltySecondsRemaining = entryTime > 0
          ? Math.max(0, entryTime + minStakeTime - now)
          : 0;

        const penaltyDaysRemaining = Math.ceil(penaltySecondsRemaining / 86400);

        nextVaultData = {
          ...nextVaultData,
          coreStaked: Number(ethers.formatEther(user[0])),
          nftCount: Number(user[1]),
          earnedCore: Number(ethers.formatEther(user[4])),
          earlyExit: Boolean(user[5]),
          boost: Number(user[6]) / 10000,
          entryTime,
          penaltyDaysRemaining,
          userShare: totalCoreStaked > 0
            ? (Number(ethers.formatEther(user[0])) / totalCoreStaked) * 100
            : 0,
        };
      }

      // === Load Stake History ===
      const history = await fetchStakeHistory();
      nextVaultData.stakeHistory = history || [];

      setVaultData(nextVaultData);
      console.log("✅ Vault data loaded successfully");
    } catch (err) {
      console.error("❌ loadVaultData failed:", err);
    } finally {
      setLoading(false);
    }
  }, [provider, account]);

  // Auto-refresh
  useEffect(() => {
    loadVaultData();

    const interval = setInterval(loadVaultData, 45 * 1000); // every 45 seconds
    return () => clearInterval(interval);
  }, [loadVaultData]);

  return {
    vaultData,
    reloadVaultData: loadVaultData,
    loading,
  };
}

// Separate history fetcher
async function fetchStakeHistory() {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vault/stake-history`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.history || [];
  } catch (err) {
    console.warn("Backend history fetch failed, using empty history:", err);
    return [];
  }
}