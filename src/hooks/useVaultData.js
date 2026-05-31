import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json" assert { type: "json" };

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

      const [
        totalCoreStakedRaw,
        rewardsRemainingRaw,
        blocksRemaining,
        totalCoreBurnedRaw,
        rewardPerBlockRaw,
      ] = await Promise.all([
        staking.totalCoreStaked(),
        staking.rewardsRemainingBySchedule(),
        staking.blocksRemaining(),
        staking.totalCoreBurned(),
        staking.rewardPerBlock(),
      ]);

      const totalCoreStaked = Number(ethers.formatEther(totalCoreStakedRaw));
      const rewardsRemaining = Number(ethers.formatEther(rewardsRemainingRaw));
      const rewardPerBlock = Number(ethers.formatEther(rewardPerBlockRaw));

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
      };

      if (account) {
        const user = await staking.getUser(account);
        nextVaultData = {
          ...nextVaultData,
          coreStaked: Number(ethers.formatEther(user[0])),
          nftCount: Number(user[1]),
          rewardWeight: Number(ethers.formatEther(user[2])),
          entryTime: Number(user[3]),
          earnedCore: Number(ethers.formatEther(user[4])),
          earlyExit: Boolean(user[5]),
          boost: Number(user[6]) / 10000,
          userShare: totalCoreStaked > 0 
            ? (Number(ethers.formatEther(user[0])) / totalCoreStaked) * 100 
            : 0,
        };
      }

      // === Load History ===
      let history = await fetchStakeHistory(staking, provider);

      // === FORCE TODAY'S VALUES (This is the critical part) ===
      const todayStr = new Date().toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      const enrichedHistory = history.map(entry => {
        const isToday = entry.date === todayStr;

        return {
          ...entry,
          coreStaked: isToday ? Math.floor(nextVaultData.totalCoreStaked) : (entry.coreStaked || 0),
          nftsStaked: isToday ? (nextVaultData.nftCount || 0) : (entry.nftsStaked || 0),
          rewardsRemaining: nextVaultData.rewardsRemaining,
          currentApr: nextVaultData.currentApr,
        };
      });

      nextVaultData.stakeHistory = enrichedHistory;
      
      setVaultData(nextVaultData);
      console.log("✅ Vault data loaded | Today NFTs:", nextVaultData.nftCount);
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

// ==================== MAIN FUNCTION ====================
export async function fetchStakeHistory(stakingContract, provider) {
  try {
    const currentBlock = await provider.getBlockNumber();
    let state = await loadHistory();
    let lastProcessedBlock = state.lastProcessedBlock || CONTRACT_CREATION_BLOCK;

    console.log(`[StakeHistory] Last: ${lastProcessedBlock} | Current: ${currentBlock}`);

    if (lastProcessedBlock >= currentBlock - 30) {
      console.log("[StakeHistory] Up to date.");
      return state.history || [];
    }

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();
    const nftWithdrawFilter = stakingContract.filters.NFTWithdrawn?.() || null;

    let allNewCoreEvents = [];
    let allNewNftEvents = [];
    let allNewNftWithdrawEvents = [];

    let chunkSize = 250; // Start very small
    let from = lastProcessedBlock + 1;

    while (from <= currentBlock) {
      const to = Math.min(from + chunkSize - 1, currentBlock);

      console.log(`[StakeHistory] Fetching chunk ${from} → ${to} (size: ${chunkSize})`);

      let success = false;
      let retries = 3;

      while (!success && retries > 0) {
        try {
          const [coreChunk, nftChunk, withdrawChunk] = await Promise.all([
            stakingContract.queryFilter(coreFilter, from, to),
            stakingContract.queryFilter(nftFilter, from, to),
            nftWithdrawFilter ? stakingContract.queryFilter(nftWithdrawFilter, from, to) : Promise.resolve([])
          ]);

          allNewCoreEvents.push(...coreChunk);
          allNewNftEvents.push(...nftChunk);
          if (withdrawChunk) allNewNftWithdrawEvents.push(...withdrawChunk);

          success = true;
        } catch (err) {
          retries--;
          console.warn(`Chunk ${from}-${to} failed (retry ${3-retries}/3)`);
          
          if (retries > 0) {
            chunkSize = Math.max(100, Math.floor(chunkSize * 0.5)); // Reduce aggressively
            await new Promise(r => setTimeout(r, 1500)); // Longer wait
          }
        }
      }

      from = to + 1;
      await new Promise(r => setTimeout(r, 200)); // Respectful delay
    }

    console.log(`[StakeHistory] Collected: ${allNewCoreEvents.length} CORE | ${allNewNftEvents.length} NFT events`);

    const newDailyData = await processEvents(allNewCoreEvents, allNewNftEvents, allNewNftWithdrawEvents, provider);

    // Merge
    let updatedHistory = [...(state.history || [])];

    Object.values(newDailyData).forEach(newDay => {
      const idx = updatedHistory.findIndex(h => h.date === newDay.date);
      if (idx !== -1) {
        updatedHistory[idx].coreStaked = (updatedHistory[idx].coreStaked || 0) + (newDay.coreStaked || 0);
        updatedHistory[idx].nftsStaked = (updatedHistory[idx].nftsStaked || 0) + (newDay.nftsStaked || 0);
      } else {
        updatedHistory.push(newDay);
      }
    });

    updatedHistory.sort((a, b) => a.date.localeCompare(b.date));

    // Cumulative NFT count
    let runningNft = 0;
    for (let entry of updatedHistory) {
      runningNft += (entry.nftsStaked || 0);
      entry.nftsStaked = Math.max(0, runningNft);
    }

    // Ensure today
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!updatedHistory.some(h => h.date === today)) {
      updatedHistory.push({ date: today, coreStaked: 0, nftsStaked: runningNft });
    }

    const newState = {
      lastProcessedBlock: currentBlock,
      history: updatedHistory,
    };

    await saveHistory(newState);
    await saveLastBlockLocked(HISTORY_KEY, currentBlock);

    console.log("Returning history with today:", updatedHistory[updatedHistory.length - 1]);
    console.log(`[StakeHistory] ✅ Updated | ${updatedHistory.length} days`);
    return updatedHistory;

  } catch (err) {
    console.error("[StakeHistory] Critical Error:", err);
    throw err;
  }
}