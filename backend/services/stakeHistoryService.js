// backend/services/stakeHistoryService.js
import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { loadLastBlockLocked, saveLastBlockLocked } from "../utils/blockState.js";
import { formatChartDate } from "./formatChartDate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");

const CONTRACT_CREATION_BLOCK = 13853455;
const CHUNK_SIZE = 250;

// ===================== FILE HELPERS =====================

async function ensureDataDir() {
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true }).catch(() => {});
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return {
      lastProcessedBlock: CONTRACT_CREATION_BLOCK,
      history: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function saveHistory(data) {
  await ensureDataDir();
  const payload = {
    ...data,
    lastUpdated: new Date().toISOString(),
  };

  await fs.writeFile(HISTORY_FILE, JSON.stringify(payload, null, 2));
  console.log(`[StakeHistory] Saved ${payload.history?.length || 0} entries`);
}

// ===================== DATE KEY (FIXED) =====================

function getDayKey(timestamp) {
  const d = new Date(timestamp * 1000);
  return d.toISOString().split("T")[0];
}

// ===================== MAIN INDEXER =====================

export async function fetchStakeHistory(
  stakingContract,
  dripContract,
  provider,
  options = {}
) {
  try {
    const {
      force = false,
      fromBlock = CONTRACT_CREATION_BLOCK,
    } = options;

    if (!provider) throw new Error("Provider is undefined");
    if (!stakingContract) throw new Error("stakingContract is undefined");

    const currentBlock = await provider.getBlockNumber();

    let state = await loadHistory();

    // ================= FORCE RESET =================
    if (force) {
      console.log("[StakeHistory] 🔥 FORCE MODE ENABLED → rebuilding from scratch");

      state = {
        lastProcessedBlock: fromBlock,
        history: [],
      };
    }

    let lastProcessedBlock = state.lastProcessedBlock || CONTRACT_CREATION_BLOCK;

    console.log(
      `[StakeHistory] Start=${lastProcessedBlock} | Current=${currentBlock} | Force=${force}`
    );

    // ================= SKIP IF UP TO DATE =================
    if (!force && lastProcessedBlock >= currentBlock - 30) {
      console.log("[StakeHistory] Up to date.");
      return state.history || [];
    }

    // ================= EVENT FILTERS =================
    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();
    const nftWithdrawFilter = stakingContract.filters.NFTWithdrawn?.();

    const coreEvents = [];
    const nftEvents = [];
    const nftWithdrawEvents = [];

    // ================= CHUNK SCAN =================
    for (
      let from = lastProcessedBlock + 1;
      from <= currentBlock;
      from += CHUNK_SIZE
    ) {
      const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);

      console.log(`[StakeHistory] Scanning ${from} → ${to}`);

      try {
        const [coreChunk, nftChunk, withdrawChunk] = await Promise.all([
          stakingContract.queryFilter(coreFilter, from, to),
          stakingContract.queryFilter(nftFilter, from, to),
          nftWithdrawFilter
            ? stakingContract.queryFilter(nftWithdrawFilter, from, to)
            : [],
        ]);

        coreEvents.push(...coreChunk);
        nftEvents.push(...nftChunk);
        nftWithdrawEvents.push(...withdrawChunk);
      } catch (err) {
        console.warn(`[StakeHistory] Chunk failed ${from}-${to}`, err.message);
      }
    }

    // ================= PROCESS EVENTS =================
    const newDaily = await processEvents(
      coreEvents,
      nftEvents,
      nftWithdrawEvents,
      provider
    );

    const userNFTMap = {};

    // ================= MERGE HISTORY =================
    const historyMap = new Map();

    for (const h of state.history || []) {
      historyMap.set(h.date, { ...h });
    }

    for (const day of Object.values(newDaily)) {
      const existing = historyMap.get(day.date);

      if (!existing) {
        historyMap.set(day.date, { ...day });
      } else {
        existing.coreStaked =
          (existing.coreStaked || 0) + (day.coreStaked || 0);
        existing.nftsStaked =
          (existing.nftsStaked || 0) + (day.nftsStaked || 0);
      }
    }

    let updatedHistory = Array.from(historyMap.values());

    // ================= TODAY METRICS =================
    const todayKey = getDayKey(Math.floor(Date.now() / 1000));

    let today = updatedHistory.find((h) => h.date === todayKey);

    if (!today) {
      today = { date: todayKey, coreStaked: 0, nftsStaked: 0 };
      updatedHistory.push(today);
    }

    try {
const [
  totalStakedRaw,
  totalFundedRaw,
  totalPaidRaw,
  rewardPerBlockRaw
] = await Promise.all([
  stakingContract.totalCoreStaked(),
  stakingContract.totalRewardsFunded(),
  stakingContract.totalRewardsPaid(),
  stakingContract.rewardPerBlock(),
]);

const totalStaked = Number(ethers.formatEther(totalStakedRaw));
const totalFunded = Number(ethers.formatEther(totalFundedRaw));
const totalPaid = Number(ethers.formatEther(totalPaidRaw));
const rpb = Number(ethers.formatEther(rewardPerBlockRaw));

const rewardsRemaining = Math.max(0, totalFunded - totalPaid);

const blocksPerYear = 6307200;

today.coreStaked = totalStaked;
today.rewardsRemaining = rewardsRemaining;
today.currentApr =
  totalStaked > 0 ? ((rpb * blocksPerYear) / totalStaked) * 100 : 0;
    } catch (e) {
      console.warn("[StakeHistory] metrics failed:", e.message);
    }

    // ================= NFT CUMULATIVE FIX =================
    let nftRunning = 0;

    for (const entry of updatedHistory) {
      nftRunning += entry.nftsStaked || 0;
      entry.nftsStaked = Math.max(0, nftRunning);
    }

updatedHistory.sort((a, b) =>
  a.date.localeCompare(b.date)
);

const newState = {
  lastProcessedBlock: currentBlock,
  history: updatedHistory,
  userStakes: activeUserNFTs,
};

    await saveHistory(newState);
    await saveLastBlockLocked("stakeHistoryLastBlock", currentBlock);

    console.log(
      `[StakeHistory] ✅ Done | ${updatedHistory.length} entries`
    );

    return updatedHistory;
  } catch (err) {
    console.error("[StakeHistory] Fatal error:", err);
    throw err;
  }
}

// ===================== EVENT PROCESSOR =====================

async function processEvents(coreEvents, nftEvents, nftWithdrawEvents, provider) {
  const daily = {};
  const cache = new Map();

  async function getBlock(blockNumber) {
    if (!cache.has(blockNumber)) {
      cache.set(blockNumber, await provider.getBlock(blockNumber));
    }
    return cache.get(blockNumber);
  }

  for (const e of coreEvents) {
    const block = await getBlock(e.blockNumber);
    const day = getDayKey(block.timestamp);

    if (!daily[day]) daily[day] = { date: day, coreStaked: 0, nftsStaked: 0 };

    daily[day].coreStaked += Number(ethers.formatEther(e.args.amount || 0));
  }

for (const e of nftEvents) {
  const user = e.args.user.toLowerCase();
  const collection = e.args.collection;
  const tokenId = e.args.tokenId.toString();

  const block = await getBlock(e.blockNumber);
  const day = getDayKey(block.timestamp);

  if (!daily[day]) {
    daily[day] = { date: day, coreStaked: 0, nftsStaked: 0 };
  }

  daily[day].nftsStaked += 1;

  if (!userNFTMap[user]) userNFTMap[user] = [];

  userNFTMap[user].push({
    nftAddress: collection,
    tokenId,
  });
}

for (const e of nftWithdrawEvents || []) {
  const user = e.args.user.toLowerCase();
  const collection = e.args.collection;
  const tokenId = e.args.tokenId.toString();

  const block = await getBlock(e.blockNumber);
  const day = getDayKey(block.timestamp);

  if (!daily[day]) {
    daily[day] = { date: day, coreStaked: 0, nftsStaked: 0 };
  }

  daily[day].nftsStaked -= 1;

  const list = userNFTMap[user];
  if (list) {
    userNFTMap[user] = list.filter(
      (nft) =>
        !(
          nft.nftAddress.toLowerCase() === collection.toLowerCase() &&
          nft.tokenId === tokenId
        )
    );
  }
}
  return daily;
}

const activeUserNFTs = {};

for (const [user, events] of Object.entries(userNFTMap)) {
  const map = new Map();

  for (const nft of events) {
    const key = `${nft.nftAddress.toLowerCase()}-${nft.tokenId}`;
    map.set(key, nft);
  }

  activeUserNFTs[user] = Array.from(map.values());
}

// ===================== FORCE EXPORT =====================

export async function forceUpdateHistory(
  stakingContract,
  dripContract,
  provider,
  fromBlock
) {
  return fetchStakeHistory(stakingContract, dripContract, provider, {
    force: true,
    fromBlock,
  });
}