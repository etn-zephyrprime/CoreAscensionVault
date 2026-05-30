// backend/services/stakeHistoryService.js
import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { 
  loadLastBlockLocked, 
  saveLastBlockLocked 
} from "../utils/blockState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");

const CONTRACT_CREATION_BLOCK = 13853455;
const HISTORY_KEY = "stakeHistoryLastBlock";
const CHUNK_SIZE = 500; // Safe for Ankr RPC

// Ensure directory exists
async function ensureDataDir() {
  const dir = path.dirname(HISTORY_FILE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {}
}

// Load history from file
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

// Save history to file
async function saveHistory(data) {
  try {
    await ensureDataDir();
    const payload = {
      ...data,
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(HISTORY_FILE, JSON.stringify(payload, null, 2));
    console.log(`[StakeHistory] Saved ${data.history?.length || 0} days`);
  } catch (err) {
    console.error("[StakeHistory] Save failed:", err);
  }
}

// Process events into daily aggregates → CUMULATIVE TOTALS
async function processEvents(coreEvents, nftEvents, nftWithdrawEvents, provider) {
  const dailyData = {};
  const blockCache = new Map();

  // CORE Staked Events (cumulative)
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

  // NFT Staked Events
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

  // NFT Withdrawn Events (subtract)
  for (const event of nftWithdrawEvents) {
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

// ==================== MAIN FUNCTION ====================
export async function fetchStakeHistory(stakingContract, provider) {
  try {
    const currentBlock = await provider.getBlockNumber();
    let state = await loadHistory();
    let lastProcessedBlock = state.lastProcessedBlock || CONTRACT_CREATION_BLOCK;

    console.log(`[StakeHistory] Last: ${lastProcessedBlock} | Current: ${currentBlock}`);

    if (lastProcessedBlock >= currentBlock) {
      console.log("[StakeHistory] Up to date.");
      return state.history || [];
    }

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();
    const nftWithdrawFilter = stakingContract.filters.NFTWithdrawn();

    let allNewCoreEvents = [];
    let allNewNftEvents = [];
    let allNewNftWithdrawEvents = [];

    // Fetch in safe chunks
    for (let from = lastProcessedBlock + 1; from <= currentBlock; from += CHUNK_SIZE) {
      const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);

      try {
        const [coreChunk, nftChunk, withdrawChunk] = await Promise.all([
          stakingContract.queryFilter(coreFilter, from, to),
          stakingContract.queryFilter(nftFilter, from, to),
          stakingContract.queryFilter(nftWithdrawFilter, from, to)
        ]);

        allNewCoreEvents.push(...coreChunk);
        allNewNftEvents.push(...nftChunk);
        allNewNftWithdrawEvents.push(...withdrawChunk);

        if (to < currentBlock) await new Promise(r => setTimeout(r, 100));
      } catch (chunkErr) {
        console.warn(`Chunk ${from}-${to} failed`);
      }
    }

    const newDailyData = await processEvents(allNewCoreEvents, allNewNftEvents, allNewNftWithdrawEvents, provider);

    // Merge with existing history
    let updatedHistory = [...(state.history || [])];

    Object.values(newDailyData).forEach(newDay => {
      const existingIndex = updatedHistory.findIndex(h => h.date === newDay.date);
      if (existingIndex !== -1) {
        updatedHistory[existingIndex].coreStaked = (updatedHistory[existingIndex].coreStaked || 0) + (newDay.coreStaked || 0);
        updatedHistory[existingIndex].nftsStaked = (updatedHistory[existingIndex].nftsStaked || 0) + (newDay.nftsStaked || 0);
      } else {
        updatedHistory.push(newDay);
      }
    });

    updatedHistory.sort((a, b) => a.date.localeCompare(b.date));

    // === MAKE NFT COUNT CUMULATIVE (carry forward) ===
    let runningNftTotal = 0;
    for (let i = 0; i < updatedHistory.length; i++) {
      runningNftTotal += (updatedHistory[i].nftsStaked || 0);
      updatedHistory[i].nftsStaked = Math.max(0, runningNftTotal); // prevent negative
    }

    // Always ensure today has current totals (if we can get them)
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const todayIndex = updatedHistory.findIndex(h => h.date === today);

    if (todayIndex !== -1) {
      // Today will be enriched properly by frontend
      updatedHistory[todayIndex].coreStaked = updatedHistory[todayIndex].coreStaked || 0;
    } else {
      updatedHistory.push({
        date: today,
        coreStaked: 0,
        nftsStaked: runningNftTotal,
      });
    }

    // Save
    const newState = {
      lastProcessedBlock: currentBlock,
      history: updatedHistory,
    };

    await saveHistory(newState);
    await saveLastBlockLocked(HISTORY_KEY, currentBlock);

    console.log(`[StakeHistory] ✅ Updated | ${updatedHistory.length} days`);
    return updatedHistory;

  } catch (err) {
    console.error("[StakeHistory] Error:", err);
    throw err;
  }
}

export async function forceUpdateHistory(stakingContract, provider) {
  return fetchStakeHistory(stakingContract, provider);
}