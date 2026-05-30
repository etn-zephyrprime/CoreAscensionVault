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
const CHUNK_SIZE = 2500; // Safe size for Ankr RPC

// ... (keep your ensureDataDir, loadHistory, saveHistory functions) ...

// Process events (same as before)
async function processEvents(coreEvents, nftEvents, provider) {
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
      console.log("[StakeHistory] Already up to date");
      return state.history || [];
    }

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();

    let allNewCoreEvents = [];
    let allNewNftEvents = [];

    // Process in small chunks
    for (let from = lastProcessedBlock + 1; from <= currentBlock; from += CHUNK_SIZE) {
      const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);

      console.log(`[StakeHistory] Fetching chunk ${from} → ${to}`);

      try {
        const [coreChunk, nftChunk] = await Promise.all([
          stakingContract.queryFilter(coreFilter, from, to),
          stakingContract.queryFilter(nftFilter, from, to)
        ]);

        allNewCoreEvents.push(...coreChunk);
        allNewNftEvents.push(...nftChunk);

        // Small delay to be nice to RPC
        if (to < currentBlock) await new Promise(r => setTimeout(r, 100));
      } catch (chunkErr) {
        console.warn(`Chunk ${from}-${to} failed:`, chunkErr.message);
      }
    }

    console.log(`[StakeHistory] Total new events: ${allNewCoreEvents.length} CORE | ${allNewNftEvents.length} NFT`);

    const newDailyData = await processEvents(allNewCoreEvents, allNewNftEvents, provider);

    // Merge with existing
    let updatedHistory = [...(state.history || [])];

    Object.values(newDailyData).forEach(newDay => {
      const existingIndex = updatedHistory.findIndex(h => h.date === newDay.date);
      if (existingIndex !== -1) {
        updatedHistory[existingIndex].coreStaked = (updatedHistory[existingIndex].coreStaked || 0) + newDay.coreStaked;
        updatedHistory[existingIndex].nftsStaked = (updatedHistory[existingIndex].nftsStaked || 0) + newDay.nftsStaked;
      } else {
        updatedHistory.push(newDay);
      }
    });

    updatedHistory.sort((a, b) => a.date.localeCompare(b.date));

    // Save
    const newState = {
      lastProcessedBlock: currentBlock,
      history: updatedHistory,
    };

    await saveHistory(newState);
    await saveLastBlockLocked(HISTORY_KEY, currentBlock);

    console.log(`[StakeHistory] ✅ Updated | ${updatedHistory.length} days tracked`);
    return updatedHistory;

  } catch (err) {
    console.error("[StakeHistory] Error:", err);
    throw err;
  }
}