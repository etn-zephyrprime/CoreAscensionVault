import React, { useCallback, useEffect, useState, useRef } from "react";
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
  const mountedRef = useRef(true);
  const previousAccountRef = useRef(null);

  const loadVaultData = useCallback(async (source = "auto") => {
    if (!provider || !account || !mountedRef.current) return;

    setLoading(true);
    console.log(`🔄 [${source}] Loading vault data for`, account);

    try {
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);
      const drip = new ethers.Contract(DRIP_FUNDER_ADDRESS, dripABI, provider);

      // Global stats
      const globalResults = await Promise.allSettled([
        staking.totalCoreStaked(),
        staking.totalCoreBurned(),
        staking.rewardPerBlock(),
        staking.endBlock(),
        drip.nextDripIn?.() || Promise.resolve(0),
        provider.getBlockNumber(),
      ]);

      const totalCoreStaked = Number(ethers.formatEther(globalResults[0].status === "fulfilled" ? globalResults[0].value : 0));
      const blocksRemaining = Math.max(0, Number(globalResults[3].status === "fulfilled" ? globalResults[3].value : 0) - Number(globalResults[5].status === "fulfilled" ? globalResults[5].value : 0));

      const rewardsRemaining = blocksRemaining > 0 && globalResults[2].status === "fulfilled"
        ? Number(ethers.formatEther(BigInt(blocksRemaining) * globalResults[2].value))
        : 0;

      const currentApr = totalCoreStaked > 0 && globalResults[2].status === "fulfilled"
        ? ((Number(ethers.formatEther(globalResults[2].value)) * 6307200) / totalCoreStaked) * 100
        : 0;

      // User data
      let userData = {};
      if (account) {
        try {
          const user = await staking.getUser(account);
          console.log("✅ getUser success on", source, ":", user);

          const minStakeTime = await staking.MIN_STAKE_TIME();

          const coreStaked = Number(ethers.formatEther(user[0] || 0));
          const nftCount = Number(user[1] || 0);
          const entryTime = Number(user[3] || 0);
          const pendingRewards = Number(ethers.formatEther(user[4] || 0));
          const currentlyEarly = Boolean(user[5]);
          const boostBps = Number(user[6] || 0);

          const now = Math.floor(Date.now() / 1000);
          const penaltySeconds = entryTime > 0 ? Math.max(0, entryTime + Number(minStakeTime) - now) : 0;

          userData = {
            coreStaked: Number(coreStaked.toFixed(4)),
            nftCount,
            earnedCore: Number(pendingRewards.toFixed(4)),
            earlyExit: currentlyEarly,
            boost: boostBps / 10000,
            penaltyDaysRemaining: Math.ceil(penaltySeconds / 86400),
            userShare: totalCoreStaked > 0 ? (coreStaked / totalCoreStaked) * 100 : 0,
          };
        } catch (e) {
          console.warn("⚠️ getUser failed:", e.message);
        }
      }

      const nextVaultData = {
        ...fallbackVault,
        ...userData,
        totalCoreStaked: Number(totalCoreStaked.toFixed(2)),
        rewardsRemaining: Number(rewardsRemaining.toFixed(2)),
        daysRemaining: Math.max(0, Math.floor((blocksRemaining * 5) / 86400)),
        currentApr: Number(currentApr.toFixed(2)),
        totalCoreBurned: 5 + Number(ethers.formatEther(globalResults[1].status === "fulfilled" ? globalResults[1].value : 0)),
      };

      console.log("✅ Setting final vaultData:", nextVaultData);
      setVaultData(nextVaultData);

    } catch (err) {
      console.error("Critical error in loadVaultData:", err);
    } finally {
      setLoading(false);
    }
  }, [provider, account]);

  // Main effect
  useEffect(() => {
    if (provider && account) {
      // Reset if account changed
      if (previousAccountRef.current !== account) {
        console.log("🔄 Account changed, resetting data");
        setVaultData(fallbackVault);
        previousAccountRef.current = account;
      }

      // Initial load with delay for WalletConnect
      const timer = setTimeout(() => loadVaultData("initial"), 800);

      const interval = setInterval(() => loadVaultData("poll"), 60000);

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [provider, account, loadVaultData]);

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