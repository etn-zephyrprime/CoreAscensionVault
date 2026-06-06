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

export function useVaultData(provider, account, isConnected) {
  const [vaultData, setVaultData] = useState(fallbackVault);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const loadAttemptRef = useRef(0);

const loadVaultData = useCallback(async (source = "auto") => {
  if (!provider || !account || !isConnected || !mountedRef.current) return;

  // Guard: if we're on the wrong network, don't even try to read contracts
  try {
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    if (chainId !== 52014) {
      console.warn(`Wrong network: ${chainId}, expected 52014`);
      return; // bail out — no point reading contracts on wrong chain
    }
  } catch (e) {
    console.warn("Could not verify network:", e.message);
    return;
  }

  try {
    await provider.getNetwork();
  } catch (err) {
    console.warn("Provider not ready yet", err);
    return;
  }

    loadAttemptRef.current += 1;
    setLoading(true);

    console.log(`🔄 [${source}] Attempt #${loadAttemptRef.current} for`, account);

    try {
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);
      const drip = new ethers.Contract(DRIP_FUNDER_ADDRESS, dripABI, provider);

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

// Fetch stakeHistory outside the account block so it's always in scope
const stakeHistory = await fetchStakeHistory();

let userData = {};
if (account) {
  try {
    const user = await staking.getUser(account);
    console.log("✅ getUser success:", user);

    const minStakeTime = await staking.MIN_STAKE_TIME();

    const coreRaw = user.coreStaked ?? user[0] ?? 0;
    const nftRaw = user.nftCount ?? user[1] ?? 0;
    const entryRaw = user.entryTime ?? user[3] ?? 0;
    const rewardRaw = user.pendingRewards ?? user[4] ?? 0;
    const earlyRaw = user.currentlyEarly ?? user[5] ?? false;
    const boostRaw = user.boostBps ?? user[6] ?? 0;

    const coreStaked = Number(ethers.formatEther(coreRaw));
    const nftCount = Number(nftRaw);
    const entryTime = Number(entryRaw);
    const pendingRewards = Number(ethers.formatEther(rewardRaw));

    const currentlyEarly =
      earlyRaw === true ||
      earlyRaw === 1 ||
      earlyRaw === "1" ||
      earlyRaw === "true";

    const boostBps = Number(boostRaw);

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
      userShare: totalCoreStaked > 0
        ? (coreStaked / totalCoreStaked) * 100
        : 0,
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
  totalCoreBurned: 5 + Number(ethers.formatEther(
    globalResults[1].status === "fulfilled" ? globalResults[1].value : 0
  )),
  stakeHistory, // ✅ now in scope
};
      console.log("✅ FINAL vaultData set:", nextVaultData);
      setVaultData(nextVaultData);

    } catch (err) {
      console.error("Critical error:", err);
    } finally {
      setLoading(false);
    }
  }, [provider, account]);

// Replace your boot() useEffect with this:
useEffect(() => {
  if (!provider || !account || !isConnected) return;

  let cancelled = false;

  async function boot() {
    await new Promise(res => setTimeout(res, 1500));
    if (cancelled) return;
    try {
      await provider.getNetwork();
      if (!cancelled) await loadVaultData("initial");
    } catch (e) {
      await new Promise(res => setTimeout(res, 3000));
      if (!cancelled) loadVaultData("retry");
    }
  }

  boot();

  const interval = setInterval(() => {
    if (!cancelled) loadVaultData("poll");
  }, 60000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, [provider, account, isConnected, loadVaultData]); // 👈 isConnected added
  return { vaultData, reloadVaultData: loadVaultData, loading };
}

async function fetchStakeHistory() {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vault/stake-history`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    // Ensure every entry has rewardsRemaining
    return (data.history || []).map(entry => ({
      rewardsRemaining: 0,  // default first so it's always present
      ...entry,
    }));
  } catch {
    return [];
  }
}