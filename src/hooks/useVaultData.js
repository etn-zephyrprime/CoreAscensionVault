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
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);
      const drip = new ethers.Contract(DRIP_FUNDER_ADDRESS, dripABI, provider);

      // === GLOBAL DATA ===
      const [totalCoreStakedRaw, totalCoreBurnedRaw, rewardPerBlockRaw, nextDripSecondsRaw, endBlockRaw] =
        await Promise.all([
          staking.totalCoreStaked(),
          staking.totalCoreBurned(),
          staking.rewardPerBlock(),
          drip.nextDripIn(),
          staking.endBlock().catch(() => 0),
        ]);

      const totalCoreStaked = Number(ethers.formatEther(totalCoreStakedRaw));
      const rewardPerBlock = Number(ethers.formatEther(rewardPerBlockRaw));
      const nextDripSeconds = Number(nextDripSecondsRaw);

      // Calculate rewards remaining using endBlock
      let rewardsRemaining = 0;
      try {
        const currentBlock = await provider.getBlockNumber();
        if (currentBlock < Number(endBlockRaw)) {
          const blocksLeft = Number(endBlockRaw) - currentBlock;
          rewardsRemaining = Number(ethers.formatEther(blocksLeft * rewardPerBlockRaw));
        }
      } catch (e) {
        console.warn("Could not calculate rewards remaining");
      }

      const currentApr = totalCoreStaked > 0
        ? ((rewardPerBlock * 6_307_200) / totalCoreStaked) * 100
        : 0;

      const daysRemaining = Math.floor((Number(endBlockRaw || 0) * 5) / 86400); // rough estimate

      let nextVaultData = {
        ...fallbackVault,
        totalCoreStaked,
        rewardsRemaining,
        daysRemaining: Math.max(0, daysRemaining),
        totalCoreBurned: Number(ethers.formatEther(totalCoreBurnedRaw)),
        currentApr: Number(currentApr.toFixed(2)),
        nextDripSeconds,
      };

      // === USER DATA ===
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
            coreStaked,
            nftCount,
            earnedCore: pendingRewards,
            earlyExit: currentlyEarly,
            boost: boostBps / 10000,
            penaltyDaysRemaining: Math.ceil(penaltySeconds / 86400),
            userShare: totalCoreStaked > 0 ? (coreStaked / totalCoreStaked) * 100 : 0,
          };
        } catch (userErr) {
          console.warn("User data failed:", userErr.message);
        }
      }

      const history = await fetchStakeHistory();
      nextVaultData.stakeHistory = history || [];

      setVaultData(nextVaultData);
      console.log("✅ Vault data loaded successfully");
    } catch (err) {
      console.error("❌ Critical loadVaultData error:", err);
    } finally {
      setLoading(false);
    }
  }, [provider, account]);

  useEffect(() => {
    loadVaultData();
    const interval = setInterval(loadVaultData, 60000); // every 60s
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