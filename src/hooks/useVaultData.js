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

  const loadVaultData = useCallback(async () => {
    if (!provider) {
      console.log("⏳ No provider yet");
      return;
    }

    setLoading(true);
    console.log("🔄 Loading vault data... Account:", account);

    try {
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);
      const drip = new ethers.Contract(DRIP_FUNDER_ADDRESS, dripABI, provider);

      // Global stats
      const globalPromises = await Promise.allSettled([
        staking.totalCoreStaked(),
        staking.totalCoreBurned(),
        staking.rewardPerBlock(),
        staking.endBlock(),
        drip.nextDripIn(),
        provider.getBlockNumber(),
      ]);

      const totalCoreStakedRaw = globalPromises[0].status === "fulfilled" ? globalPromises[0].value : 0;
      const totalCoreBurnedRaw = globalPromises[1].status === "fulfilled" ? globalPromises[1].value : 0;
      const rewardPerBlockRaw = globalPromises[2].status === "fulfilled" ? globalPromises[2].value : 0;
      const endBlockRaw = globalPromises[3].status === "fulfilled" ? globalPromises[3].value : 0;
      const nextDripSecondsRaw = globalPromises[4].status === "fulfilled" ? globalPromises[4].value : 0;
      const currentBlock = globalPromises[5].status === "fulfilled" ? globalPromises[5].value : 0;

      const totalCoreStaked = Number(ethers.formatEther(totalCoreStakedRaw));
      const blocksRemaining = Math.max(0, Number(endBlockRaw) - currentBlock);
      const rewardsRemaining = blocksRemaining > 0 
        ? Number(ethers.formatEther(BigInt(blocksRemaining) * rewardPerBlockRaw)) 
        : 0;

      const currentApr = totalCoreStaked > 0 
        ? ((Number(ethers.formatEther(rewardPerBlockRaw)) * 6_307_200) / totalCoreStaked) * 100 
        : 0;

      let userData = {};

      // === USER DATA (most flaky part on mobile) ===
      if (account) {
        try {
          console.log("👤 Fetching user data for:", account);
          const user = await staking.getUser(account);
          const minStakeTime = await staking.MIN_STAKE_TIME();

          const coreStaked = Number(ethers.formatEther(user[0]));
          const nftCount = Number(user[1]);
          const entryTime = Number(user[3]);
          const pendingRewards = Number(ethers.formatEther(user[4]));
          const currentlyEarly = Boolean(user[5]);
          const boostBps = Number(user[6]);

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

          console.log("✅ User data loaded successfully");
        } catch (e) {
          console.warn("⚠️ User data fetch failed (common on mobile WalletConnect):", e.message);
          // Keep fallback user values
        }
      }

      const nextVaultData = {
        ...fallbackVault,
        totalCoreStaked: Number(totalCoreStaked.toFixed(2)),
        rewardsRemaining: Number(rewardsRemaining.toFixed(2)),
        daysRemaining: Math.floor((blocksRemaining * 5) / 86400),
        totalCoreBurned: 5 + Number(ethers.formatEther(totalCoreBurnedRaw)),
        currentApr: Number(currentApr.toFixed(2)),
        nextDripSeconds: Number(nextDripSecondsRaw),
        ...userData,
      };

      setVaultData(nextVaultData);
    } catch (err) {
      console.error("❌ Critical vault data error:", err);
    } finally {
      setLoading(false);
    }
  }, [provider, account]);

  useEffect(() => {
    loadVaultData();
    const interval = setInterval(loadVaultData, 45000); // 45 seconds
    return () => clearInterval(interval);
  }, [loadVaultData]);

  return { 
    vaultData, 
    reloadVaultData: loadVaultData, 
    loading 
  };
}