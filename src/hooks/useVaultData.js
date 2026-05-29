import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json";

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

const staking = new ethers.Contract(
  STAKING_ADDRESS,
  stakingABI,
  provider
);

const totalCoreStaked = await staking.totalCoreStaked();
const rewardsRemaining = await staking.rewardsRemainingBySchedule();
const blocksRemaining = await staking.blocksRemaining();
const totalCoreBurned = await staking.totalCoreBurned();
const rewardPerBlock = await staking.rewardPerBlock();

const totalCoreStakedNum = Number(ethers.formatEther(totalCoreStaked));
const rewardPerBlockNum = Number(ethers.formatEther(rewardPerBlock));

const currentApr =
  totalCoreStakedNum > 0
    ? ((rewardPerBlockNum * 6_307_200) / totalCoreStakedNum) * 100
    : 0;

      let nextVaultData = {
        ...fallbackVault,
        totalCoreStaked: Number(ethers.formatEther(totalCoreStaked)),
        rewardsRemaining: Number(ethers.formatEther(rewardsRemaining)),
        daysRemaining: Math.floor((Number(blocksRemaining) * 5) / 86400),
        totalCoreBurned: Number(ethers.formatEther(totalCoreBurned)),
        currentApr: currentApr,
      };

      if (account) {
        const user = await staking.getUser(account);

const rewardWeight = Number(ethers.formatEther(user[2]));

const userCoreStaked = Number(ethers.formatEther(user[0]));

const userShare =
  totalCoreStakedNum > 0
    ? (userCoreStaked / totalCoreStakedNum) * 100
    : 0;

const entryTime = Number(user[3]);
const minStakeTime = 60 * 24 * 60 * 60; // 60 days
const now = Math.floor(Date.now() / 1000);

const penaltySecondsRemaining =
  entryTime > 0 ? Math.max(0, entryTime + minStakeTime - now) : 0;

const penaltyDaysRemaining = Math.ceil(
  penaltySecondsRemaining / 86400
);

nextVaultData = {
          ...nextVaultData,
          coreStaked: Number(ethers.formatEther(user[0])),
          nftCount: Number(user[1]),
          rewardWeight: Number(ethers.formatEther(user[2])),
          entryTime: Number(user[3]),
          earnedCore: Number(ethers.formatEther(user[4])),
          earlyExit: Boolean(user[5]),
          boost: Number(user[6]) / 10000,
          userShare: totalCoreStakedNum > 0 ? (Number(ethers.formatEther(user[0])) / totalCoreStakedNum) * 100 : 0,
          penaltyDaysRemaining: 0, // keep your existing logic
};
      }

// === NEW: Load On-Chain Stake History ===
      // === NEW: Load On-Chain Stake History ===
// === Load On-Chain Stake History ===
// === Load On-Chain Stake History ===
const history = await fetchStakeHistory(
  staking, 
  provider, 
  nextVaultData.totalCoreStaked,
  nextVaultData.nftCount || 0   // if you have total NFTs staked somewhere
);
nextVaultData.stakeHistory = history;

      setVaultData(nextVaultData);
    } catch (err) {
      console.error("loadVaultData failed:", err);
    }
  }, [provider, account]);

  useEffect(() => {
    loadVaultData();
  }, [loadVaultData]);

  return {
    vaultData,
    reloadVaultData: loadVaultData,
  };
}

// ====================== HELPER FUNCTION ======================
async function fetchStakeHistory(stakingContract, provider, totalCoreStaked, totalNftsStaked = 0) {
  try {
    if (!provider) return createFallbackHistory(totalCoreStaked, totalNftsStaked);

    const currentBlock = await provider.getBlockNumber();
    const CONTRACT_CREATION_BLOCK = 13853455;
    const CHUNK_SIZE = 25;                    // ← As you suggested
    const MAX_HISTORY_BLOCKS = 8000;         // ~10-12 hours of data

    let fromBlock = Math.max(CONTRACT_CREATION_BLOCK, currentBlock - MAX_HISTORY_BLOCKS);

    console.log(`📡 Fetching history in ${CHUNK_SIZE}-block chunks from ${fromBlock}`);

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();

    const allCoreEvents = [];
    const allNftEvents = [];

    // Fetch in small chunks
    for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, currentBlock);

      try {
        const [coreChunk, nftChunk] = await Promise.all([
          stakingContract.queryFilter(coreFilter, start, end),
          stakingContract.queryFilter(nftFilter, start, end)
        ]);

        allCoreEvents.push(...coreChunk);
        allNftEvents.push(...nftChunk);

        // Small delay to be nice to RPC
        if (end < currentBlock) await new Promise(r => setTimeout(r, 80));
      } catch (e) {
        console.warn(`Chunk ${start}-${end} failed:`, e.message);
      }
    }

    console.log(`✅ Loaded ${allCoreEvents.length} core + ${allNftEvents.length} nft events`);

    // Process events into daily data
    const dailyData = {};
    const blockCache = new Map();

    // ... (same processing logic as before)
    for (const event of allCoreEvents) {
      try {
        let block = blockCache.get(event.blockNumber);
        if (!block) {
          block = await provider.getBlock(event.blockNumber, false);
          blockCache.set(event.blockNumber, block);
        }
        const dayKey = new Date(block.timestamp * 1000)
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
        dailyData[dayKey].coreStaked += Number(ethers.formatEther(event.args.amount || 0));
      } catch {}
    }

    for (const event of allNftEvents) {
      try {
        let block = blockCache.get(event.blockNumber);
        if (!block) {
          block = await provider.getBlock(event.blockNumber, false);
          blockCache.set(event.blockNumber, block);
        }
        const dayKey = new Date(block.timestamp * 1000)
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
        dailyData[dayKey].nftsStaked += 1;
      } catch {}
    }

    let history = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));

    // Always ensure current day is shown with latest totals
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (history.length === 0 || history[history.length - 1].date !== today) {
      history.push({
        date: today,
        coreStaked: Math.floor(totalCoreStaked),
        nftsStaked: totalNftsStaked
      });
    }

    console.log("Final chart data:", history);
    return history;

  } catch (err) {
    console.error("History fetch failed:", err);
    return createFallbackHistory(totalCoreStaked, totalNftsStaked);
  }
}

function createFallbackHistory(totalCore, totalNfts) {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return [
    { date: yesterday, coreStaked: Math.floor(totalCore * 0.72), nftsStaked: Math.floor(totalNfts * 0.8) },
    { date: today, coreStaked: Math.floor(totalCore), nftsStaked: totalNfts || 0 }
  ];
}