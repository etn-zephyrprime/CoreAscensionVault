import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS, DRIP_FUNDER_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json" with { type: "json" };
import dripABI from "../abis/dripABI.json" with { type: "json" };

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
  totalCoreBurned: 5,
  stakeHistory: [],
  nextDripSeconds: 0,
};

export function useVaultData(provider, account) {
  const [vaultData, setVaultData] = useState(fallbackVault);
  const [loading, setLoading] = useState(false);

  const loadVaultData = useCallback(async (isRetry = false) => {
    if (!provider || !account) {
      console.log("⏳ Waiting for provider + account...");
      return;
    }

    setLoading(true);
    console.log(`🔄 [${isRetry ? 'RETRY' : 'LOAD'}] Fetching vault data for`, account);

    try {
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);

      // === GLOBAL DATA (more tolerant) ===
      const globalData = await Promise.allSettled([
        staking.totalCoreStaked(),
        staking.totalCoreBurned(),
        staking.rewardPerBlock(),
        staking.endBlock(),
        provider.getBlockNumber(),
      ]);

      const totalCoreStaked = Number(ethers.formatEther(globalData[0].status === "fulfilled" ? globalData[0].value : 0));
      const totalCoreBurnedRaw = globalData[1].status === "fulfilled" ? globalData[1].value : 0;
      const rewardPerBlockRaw = globalData[2].status === "fulfilled" ? globalData[2].value : 0;
      const endBlockRaw = globalData[3].status === "fulfilled" ? globalData[3].value : 0;
      const currentBlock = globalData[4].status === "fulfilled" ? globalData[4].value : 0;

      const blocksRemaining = Math.max(0, Number(endBlockRaw) - currentBlock);
      const rewardsRemaining = blocksRemaining > 0 
        ? Number(ethers.formatEther(BigInt(blocksRemaining) * rewardPerBlockRaw)) 
        : 0;

      // === USER DATA - Most important part ===
      let userData = {};
      try {
        console.log("👤 Calling getUser...");
        const user = await staking.getUser(account);
        console.log("✅ getUser returned:", user);

        const minStakeTime = await staking.MIN_STAKE_TIME();

        const coreStaked = Number(ethers.formatEther(user[0] || 0));
        const nftCount = Number(user[1] || 0);
        const entryTime = Number(user[3] || 0);
        const pendingRewards = Number(ethers.formatEther(user[4] || 0));
        const currentlyEarly = Boolean(user[5]);
        const boostBps = Number(user[6] || 0);

        const now = Math.floor(Date.now() / 1000);
        const penaltySeconds = entryTime > 0 
          ? Math.max(0, entryTime + Number(minStakeTime) - now) 
          : 0;

        userData = {
          coreStaked: Number(coreStaked.toFixed(4)),
          nftCount,
          earnedCore: Number(pendingRewards.toFixed(4)),
          earlyExit: currentlyEarly,
          boost: boostBps / 10000,
          penaltyDaysRemaining: Math.ceil(penaltySeconds / 86400),
          userShare: totalCoreStaked > 0 ? (coreStaked / totalCoreStaked) * 100 : 0,
        };
      } catch (userErr) {
        console.error("❌ getUser failed:", userErr.message);
      }

      const nextVaultData = {
        ...fallbackVault,
        totalCoreStaked: Number(totalCoreStaked.toFixed(2)),
        rewardsRemaining: Number(rewardsRemaining.toFixed(2)),
        daysRemaining: Math.floor((blocksRemaining * 5) / 86400),
        totalCoreBurned: 5 + Number(ethers.formatEther(totalCoreBurnedRaw)),
        currentApr: totalCoreStaked > 0 
          ? Number(((Number(ethers.formatEther(rewardPerBlockRaw)) * 6307200) / totalCoreStaked * 100).toFixed(2))
          : 0,
        ...userData,
      };

      console.log("✅ Final vaultData:", nextVaultData);
      setVaultData(nextVaultData);

    } catch (err) {
      console.error("Critical error in loadVaultData:", err);
    } finally {
      setLoading(false);
    }
  }, [provider, account]);

  // Initial load + polling
  useEffect(() => {
    if (provider && account) {
      loadVaultData();
      const interval = setInterval(() => loadVaultData(true), 60000);
      return () => clearInterval(interval);
    }
  }, [loadVaultData]);

  return { 
    vaultData, 
    reloadVaultData: loadVaultData, 
    loading 
  };
}

async function fetchStakeHistory() {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vault/stake-history`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.history || [];
  } catch {
    return [];
  }
}