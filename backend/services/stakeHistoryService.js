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
    console.log(`[StakeHistory] Saved ${data.history?.length || 0} days to file`);
  } catch (err) {
    console.error("[StakeHistory] Save failed:", err);
  }
}

// Process raw events into daily data
async function processEvents(coreEvents, nftEvents, provider) {
  const dailyData = {};
  const blockCache = new Map();

  // CORE Staking Events
  for (const event of coreEvents) {
    try {
      let block = blockCache.get(event.blockNumber);
      if (!block) {
        block = await provider.getBlock(event.blockNumber, false);
        blockCache.set(event.blockNumber, block);
      }

      const date = new Date(block.timestamp * 1000);
      const dayKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!dailyData[dayKey]) {
        dailyData[dayKey] = { date: dayKey, coreStaked: 0, nftsStaked: 0 };
      }
      dailyData[dayKey].coreStaked += Number(ethers.formatEther(event.args.amount || 0));
    } catch (e) {}
  }

  // NFT Staking Events
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

  return dailyData;
}

// Main Service Function
export async function fetchStakeHistory(stakingContract, provider) {
  try {
    const currentBlock = await provider.getBlockNumber();
    let state = await loadHistory();
    let lastProcessedBlock = state.lastProcessedBlock || CONTRACT_CREATION_BLOCK;

    console.log(`[StakeHistory] Last processed block: ${lastProcessedBlock} | Current: ${currentBlock}`);

    if (lastProcessedBlock >= currentBlock) {
      console.log("[StakeHistory] Up to date.");
      return state.history || [];
    }

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();

    const newCoreEvents = await stakingContract.queryFilter(coreFilter, lastProcessedBlock + 1, currentBlock);
    const newNftEvents = await stakingContract.queryFilter(nftFilter, lastProcessedBlock + 1, currentBlock);

    console.log(`[StakeHistory] Processing ${newCoreEvents.length} new CORE + ${newNftEvents.length} NFT events`);

    const newDailyData = await processEvents(newCoreEvents, newNftEvents, provider);

    // Merge new data with existing history
    let updatedHistory = [...(state.history || [])];

    Object.values(newDailyData).forEach(newDay => {
      const existing = updatedHistory.findIndex(h => h.date === newDay.date);
      if (existing !== -1) {
        updatedHistory[existing].coreStaked = (updatedHistory[existing].coreStaked || 0) + (newDay.coreStaked || 0);
        updatedHistory[existing].nftsStaked = (updatedHistory[existing].nftsStaked || 0) + (newDay.nftsStaked || 0);
      } else {
        updatedHistory.push(newDay);
      }
    });

    updatedHistory.sort((a, b) => a.date.localeCompare(b.date));

    // Update state
    const newState = {
      lastProcessedBlock: currentBlock,
      history: updatedHistory,
    };

    await saveHistory(newState);
    await saveLastBlockLocked(HISTORY_KEY, currentBlock);

    console.log(`[StakeHistory] Updated successfully → ${updatedHistory.length} days tracked`);
    return updatedHistory;

  } catch (err) {
    console.error("[StakeHistory] Error:", err);
    throw err;
  }
}

// For manual/cron updates
export async function forceUpdateHistory(stakingContract, provider) {
  return fetchStakeHistory(stakingContract, provider);
}