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
  if (!provider) return;

  setLoading(true);
  try {
    const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);
    const drip = new ethers.Contract(DRIP_FUNDER_ADDRESS, dripABI, provider);

    const [totalCoreStakedRaw, totalCoreBurnedRaw, rewardPerBlockRaw, endBlockRaw, nextDripSecondsRaw] =
      await Promise.allSettled([
        staking.totalCoreStaked(),
        staking.totalCoreBurned(),
        staking.rewardPerBlock(),
        staking.endBlock(),
        drip.nextDripIn(),
      ]).then(results => results.map(r => r.status === "fulfilled" ? r.value : 0));

    const currentBlock = await provider.getBlockNumber().catch(() => 0);

    const blocksRemaining = Math.max(0, Number(endBlockRaw) - currentBlock);

    const totalCoreStaked = Number(ethers.formatEther(totalCoreStakedRaw));
    const rewardPerBlock = Number(ethers.formatEther(rewardPerBlockRaw));
    const nextDripSeconds = Number(nextDripSecondsRaw);

    // Rewards Remaining
    let rewardsRemaining = 0;
    if (blocksRemaining > 0) {
      rewardsRemaining = Number(ethers.formatEther(BigInt(blocksRemaining) * rewardPerBlockRaw));
    }

    const currentApr = totalCoreStaked > 0
      ? ((rewardPerBlock * 6_307_200) / totalCoreStaked) * 100
      : 0;

    const daysRemaining = Math.floor((blocksRemaining * 5) / 86400);   // ← FIXED

    const totalCoreBurned = 5 + onChainBurned;   // 5 from previous contract

    let nextVaultData = {
      ...fallbackVault,
      totalCoreStaked: Number(totalCoreStaked.toFixed(2)),
      rewardsRemaining: Number(rewardsRemaining.toFixed(2)),
      daysRemaining: Math.max(0, daysRemaining),        // Should now be ~479 days
      totalCoreBurned: Number(totalCoreBurned.toFixed(2)),
      currentApr: Number(currentApr.toFixed(2)),
      nextDripSeconds,
    };

    // User data (unchanged)
    if (account) {
      try {
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

        nextVaultData = {
          ...nextVaultData,
          coreStaked: Number(coreStaked.toFixed(4)),
          nftCount,
          earnedCore: Number(pendingRewards.toFixed(4)),
          earlyExit: currentlyEarly,
          boost: boostBps / 10000,
          penaltyDaysRemaining: Math.ceil(penaltySeconds / 86400),
          userShare: totalCoreStaked > 0 ? (coreStaked / totalCoreStaked) * 100 : 0,
        };
      } catch (e) {
        console.warn("User data failed:", e.message);
      }
    }

    const history = await fetchStakeHistory();
    nextVaultData.stakeHistory = history || [];

    setVaultData(nextVaultData);
  } catch (err) {
    console.error("❌ Critical loadVaultData error:", err);
  } finally {
    setLoading(false);
  }
}, [provider, account]);

  useEffect(() => {
    loadVaultData();
    const interval = setInterval(loadVaultData, 60000);
    return () => clearInterval(interval);
  }, [loadVaultData]);

  return { vaultData, reloadVaultData: loadVaultData, loading };
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