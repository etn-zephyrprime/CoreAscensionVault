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

      // === GLOBAL DATA - All safe calls ===
      const [totalCoreStakedRaw, rewardsRemainingRaw, totalCoreBurnedRaw, rewardPerBlockRaw, nextDripSecondsRaw] =
        await Promise.all([
          staking.totalCoreStaked(),
          staking.rewardsRemainingBySchedule(),
          staking.totalCoreBurned(),
          staking.rewardPerBlock(),
          drip.nextDripIn(),
        ]);

      // === BLOCKS REMAINING - Fully isolated with fallback ===
      let blocksRemainingRaw = 0;
      try {
        console.log("Trying blocksRemaining()...");
        blocksRemainingRaw = await staking.blocksRemaining();
        console.log("✅ blocksRemaining succeeded");
      } catch (err) {
        console.warn("❌ blocksRemaining() reverted. Using estimatedSecondsRemaining fallback");
        try {
          const estSecondsRaw = await staking.estimatedSecondsRemaining();
          blocksRemainingRaw = Math.floor(Number(estSecondsRaw) / 5); // assuming ~5s/block
          console.log("✅ Used estimatedSecondsRemaining fallback");
        } catch (fallbackErr) {
          console.warn("Both timing calls failed");
        }
      }

      const totalCoreStaked = Number(ethers.formatEther(totalCoreStakedRaw));
      const rewardsRemaining = Number(ethers.formatEther(rewardsRemainingRaw));
      const rewardPerBlock = Number(ethers.formatEther(rewardPerBlockRaw));
      const nextDripSeconds = Number(nextDripSecondsRaw);

      const currentApr = totalCoreStaked > 0
        ? ((rewardPerBlock * 6307200) / totalCoreStaked) * 100
        : 0;

      const daysRemaining = Math.floor((Number(blocksRemainingRaw) * 5) / 86400);

      let nextVaultData = {
        ...fallbackVault,
        totalCoreStaked,
        rewardsRemaining,
        daysRemaining: Math.max(0, daysRemaining),
        totalCoreBurned: Number(ethers.formatEther(totalCoreBurnedRaw)),
        currentApr,
        nextDripSeconds,
      };

      // === USER DATA ===
      if (account) {
        try {
          const user = await staking.getUser(account);
          const minStakeTime = await staking.MIN_STAKE_TIME();

          const entryTime = Number(user[3]);
          const now = Math.floor(Date.now() / 1000);

          const penaltySeconds = entryTime > 0
            ? Math.max(0, entryTime + Number(minStakeTime) - now)
            : 0;

          nextVaultData = {
            ...nextVaultData,
            coreStaked: Number(ethers.formatEther(user[0])),
            nftCount: Number(user[1]),
            earnedCore: Number(ethers.formatEther(user[4])),
            earlyExit: Boolean(user[5]),
            boost: Number(user[6]) / 10000,
            penaltyDaysRemaining: Math.ceil(penaltySeconds / 86400),
            userShare: totalCoreStaked > 0 ? (Number(ethers.formatEther(user[0])) / totalCoreStaked) * 100 : 0,
          };
        } catch (userErr) {
          console.warn("User data failed:", userErr.message);
        }
      }

      // History
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
    const interval = setInterval(loadVaultData, 45000);
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