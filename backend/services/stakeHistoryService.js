// backend/services/stakeHistoryService.js
import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { loadLastBlockLocked, saveLastBlockLocked } from "../utils/blockState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");

const CONTRACT_CREATION_BLOCK = 13853455;
const CHUNK_SIZE = 250;

// Ensure directory exists
async function ensureDataDir() {
  const dir = path.dirname(HISTORY_FILE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {}
}

// Load history
async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        lastProcessedBlock: CONTRACT_CREATION_BLOCK,
        history: [],
        lastUpdated: new Date().toISOString()
      };
    }
    console.error("Failed to load history file:", err);
    return { lastProcessedBlock: CONTRACT_CREATION_BLOCK, history: [] };
  }
}

async function saveHistory(data) {
  try {
    await ensureDataDir();
    const payload = { ...data, lastUpdated: new Date().toISOString() };
    await fs.writeFile(HISTORY_FILE, JSON.stringify(payload, null, 2));
    console.log(`[StakeHistory] Saved ${data.history?.length || 0} days`);
  } catch (err) {
    console.error("[StakeHistory] Save failed:", err);
  }
}

// ==================== MAIN FUNCTION ====================
export async function fetchStakeHistory(stakingContract, dripContract, provider) {
  try {
    // === Safety Checks ===
    if (!provider) {
      throw new Error("Provider is undefined - cannot get current block");
    }
    if (!stakingContract) {
      throw new Error("StakingContract is undefined");
    }

    const currentBlock = await provider.getBlockNumber();
    let state = await loadHistory();
    let lastProcessedBlock = state.lastProcessedBlock || CONTRACT_CREATION_BLOCK;

    console.log(`[StakeHistory] Last: ${lastProcessedBlock} | Current: ${currentBlock}`);

    // Skip if already up to date
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

    for (let from = lastProcessedBlock + 1; from <= currentBlock; from += CHUNK_SIZE) {
      const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);

      console.log(`[StakeHistory] Fetching chunk ${from} → ${to}`);

      try {
        const [coreChunk, nftChunk, withdrawChunk] = await Promise.all([
          stakingContract.queryFilter(coreFilter, from, to),
          stakingContract.queryFilter(nftFilter, from, to),
          nftWithdrawFilter ? stakingContract.queryFilter(nftWithdrawFilter, from, to) : Promise.resolve([])
        ]);

        allNewCoreEvents.push(...coreChunk);
        allNewNftEvents.push(...nftChunk);
        if (withdrawChunk) allNewNftWithdrawEvents.push(...withdrawChunk);
      } catch (err) {
        console.warn(`Chunk ${from}-${to} failed:`, err.message);
      }

      await new Promise(r => setTimeout(r, 150));
    }

    const newDailyData = await processEvents(
      allNewCoreEvents, 
      allNewNftEvents, 
      allNewNftWithdrawEvents, 
      provider
    );

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

    // === Capture accurate current metrics for TODAY ===
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let todayEntry = updatedHistory.find(h => h.date === today);

    if (!todayEntry) {
      todayEntry = { date: today, coreStaked: 0, nftsStaked: 0 };
      updatedHistory.push(todayEntry);
    }

    try {
      const [totalStakedRaw, rewardsRaw, rewardPerBlockRaw] = await Promise.all([
        stakingContract.totalCoreStaked(),
        stakingContract.rewardsRemainingBySchedule(),
        stakingContract.rewardPerBlock(),
      ]);

      const totalStaked = Number(ethers.formatEther(totalStakedRaw));
      const rewardsRemaining = Number(ethers.formatEther(rewardsRaw));
      const rpb = Number(ethers.formatEther(rewardPerBlockRaw));

      const currentApr = totalStaked > 0 
        ? ((rpb * 6307200) / totalStaked) * 100 
        : 0;

      todayEntry.coreStaked = totalStaked;
      todayEntry.rewardsRemaining = rewardsRemaining;
      todayEntry.currentApr = currentApr;

      console.log(`[StakeHistory] Today updated → Staked: ${totalStaked.toFixed(0)}, Rewards: ${rewardsRemaining.toFixed(0)}, APY: ${currentApr.toFixed(2)}%`);
    } catch (metricErr) {
      console.warn("[StakeHistory] Could not fetch current metrics:", metricErr.message);
    }

    // Make NFT count cumulative
    let runningNftTotal = 0;
    for (let entry of updatedHistory) {
      runningNftTotal += (entry.nftsStaked || 0);
      entry.nftsStaked = Math.max(0, runningNftTotal);
    }

    updatedHistory.sort((a, b) => a.date.localeCompare(b.date));

    const newState = {
      lastProcessedBlock: currentBlock,
      history: updatedHistory,
    };

    await saveHistory(newState);
    await saveLastBlockLocked("stakeHistoryLastBlock", currentBlock);

    console.log(`[StakeHistory] ✅ Updated | ${updatedHistory.length} days`);
    return updatedHistory;

  } catch (err) {
    console.error("[StakeHistory] Error:", err.message);
    throw err;
  }
}

// Keep processEvents function (unchanged)
async function processEvents(coreEvents, nftEvents, nftWithdrawEvents, provider) {
  const dailyData = {};
  const blockCache = new Map();

  for (const event of coreEvents) {
    try {
      let block = blockCache.get(event.blockNumber);
      if (!block) {
        block = await provider.getBlock(event.blockNumber, false);
        blockCache.set(event.blockNumber, block);
      }
      const date = new Date(block.timestamp * 1000);
      const dayKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
      dailyData[dayKey].coreStaked += Number(ethers.formatEther(event.args.amount || 0));
    } catch (e) {}
  }

  for (const event of nftEvents) {
    try {
      let block = blockCache.get(event.blockNumber);
      if (!block) {
        block = await provider.getBlock(event.blockNumber, false);
        blockCache.set(event.blockNumber, block);
      }
      const date = new Date(block.timestamp * 1000);
      const dayKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
      dailyData[dayKey].nftsStaked += 1;
    } catch (e) {}
  }

  for (const event of nftWithdrawEvents || []) {
    try {
      let block = blockCache.get(event.blockNumber);
      if (!block) {
        block = await provider.getBlock(event.blockNumber, false);
        blockCache.set(event.blockNumber, block);
      }
      const date = new Date(block.timestamp * 1000);
      const dayKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!dailyData[dayKey]) dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
      dailyData[dayKey].nftsStaked -= 1;
    } catch (e) {}
  }

  return dailyData;
}

export async function forceUpdateHistory(stakingContract, dripContract, provider) {
  return fetchStakeHistory(stakingContract, dripContract, provider);
}