import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { loadLastBlockLocked, saveLastBlockLocked } from "../utils/blockState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");
const STAKES_FILE = path.join(__dirname, "../data/current-stakes.json");

const CONTRACT_CREATION_BLOCK = 13853455;
const CHUNK_SIZE = 250;

// ================= FILE HELPERS =================

async function ensureDataDir() {
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true }).catch(() => {});
  await fs.mkdir(path.dirname(STAKES_FILE), { recursive: true }).catch(() => {});
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      lastProcessedBlock: CONTRACT_CREATION_BLOCK,
      history: [],
      userStakes: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function saveHistory(data) {
  await ensureDataDir();
  await fs.writeFile(
    HISTORY_FILE,
    JSON.stringify({ ...data, lastUpdated: new Date().toISOString() }, null, 2)
  );
}

async function loadStakes() {
  try {
    const raw = await fs.readFile(STAKES_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveStakes(data) {
  await ensureDataDir();
  await fs.writeFile(STAKES_FILE, JSON.stringify(data, null, 2));
}

// ================= DATE =================

function getDayKey(ts) {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

// ================= EVENT FETCHING =================

async function fetchEventsInChunks(contract, filter, fromBlock, toBlock) {
  const events = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
    console.log(`Fetching events from ${start} to ${end}...`);
    
    try {
      const chunkEvents = await contract.queryFilter(filter, start, end);
      events.push(...chunkEvents);
    } catch (err) {
      console.warn(`Error fetching chunk ${start}-${end}:`, err.message);
    }
    
    start = end + 1;
  }
  return events;
}

// ================= DAILY SNAPSHOT =================
async function upsertDailySnapshot(state, stakingContract, dripContract) {
  const today = getDayKey(Math.floor(Date.now() / 1000));
  const map = new Map(state.history?.map(h => [h.date, { ...h }]) || []);

  try {
    // Get current live chain values
    const [totalCoreStaked, rewardPerBlock, endBlock, currentBlock] = await Promise.all([
      stakingContract.totalCoreStaked(),
      stakingContract.rewardPerBlock(),
      stakingContract.endBlock(),
      stakingContract.runner.provider.getBlockNumber(),
    ]);

    const totalStaked = Number(ethers.formatEther(totalCoreStaked));
    const blocksLeft = Math.max(0, Number(endBlock) - Number(currentBlock));
    const rewardsRemaining = blocksLeft > 0
      ? Number(ethers.formatEther(BigInt(blocksLeft) * rewardPerBlock))
      : 0;
    const currentApr = totalStaked > 0
      ? ((Number(ethers.formatEther(rewardPerBlock)) * 6307200) / totalStaked) * 100
      : 0;

    const existing = map.get(today) || { date: today, coreStaked: 0, nftsStaked: 0 };
    map.set(today, {
      ...existing,
      date: today,
      rewardsRemaining: Number(rewardsRemaining.toFixed(2)),
      currentApr: Number(currentApr.toFixed(2)),
      totalCoreStaked: Number(totalStaked.toFixed(2)),
    });

    console.log(`📸 Daily snapshot for ${today}: rewardsRemaining=${rewardsRemaining.toFixed(2)}, apr=${currentApr.toFixed(2)}`);
  } catch (err) {
    console.warn("Could not take daily snapshot:", err.message);
  }

  return map;
}

export async function fetchStakeHistory(stakingContract, dripContract, provider, options = {}) {
  const { force = false, fromBlock = CONTRACT_CREATION_BLOCK } = options;

  if (!provider) throw new Error("Provider missing");
  if (!stakingContract) throw new Error("stakingContract missing");

  const currentBlock = await provider.getBlockNumber();
  let state = await loadHistory();

  if (force) {
    state = { lastProcessedBlock: fromBlock, history: [], userStakes: {} };
  }

  const lastBlock = state.lastProcessedBlock || CONTRACT_CREATION_BLOCK;

  // Always upsert today's snapshot with live chain data
  const map = await upsertDailySnapshot(state, stakingContract, dripContract);

  // Skip event processing if nothing new (but still save the snapshot)
  if (!force && lastBlock >= currentBlock - 30) {
    const history = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    const newState = { ...state, history, lastUpdated: new Date().toISOString() };
    await saveHistory(newState);
    console.log(`📸 Snapshot only — no new blocks to process`);
    return history;
  }

  const startBlock = lastBlock + 1;
  console.log(`🔄 Fetching events from block ${startBlock} to ${currentBlock}`);

  const coreStakeFilter = stakingContract.filters.CoreStaked();
  const nftStakeFilter = stakingContract.filters.NFTStaked();
  const nftWithdrawFilter = stakingContract.filters.NFTWithdrawn();

  const [coreEvents, nftEvents, withdrawEvents] = await Promise.all([
    fetchEventsInChunks(stakingContract, coreStakeFilter, startBlock, currentBlock),
    fetchEventsInChunks(stakingContract, nftStakeFilter, startBlock, currentBlock),
    fetchEventsInChunks(stakingContract, nftWithdrawFilter, startBlock, currentBlock),
  ]);

  const { daily, userNFTMap } = await processEvents(
    coreEvents, nftEvents, withdrawEvents,
    provider, stakingContract, dripContract
  );

  // Merge event data into the map (snapshot already in there)
  for (const day of Object.values(daily)) {
    const existing = map.get(day.date) || {};
    map.set(day.date, {
      ...existing,
      ...day,
      rewardsRemaining: day.rewardsRemaining !== undefined
        ? day.rewardsRemaining
        : (existing.rewardsRemaining || 0),
    });
  }

  const history = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Cumulative NFT count
  let runningNfts = 0;
  for (const d of history) {
    runningNfts += d.nftsStaked || 0;
    d.nftsStaked = Math.max(0, runningNfts);
  }

  const newState = {
    lastProcessedBlock: currentBlock,
    history,
    userStakes: userNFTMap,
    lastUpdated: new Date().toISOString(),
  };

  await saveHistory(newState);
  await saveLastBlockLocked("stakeHistoryLastBlock", currentBlock);

  console.log(`✅ Stake history updated to block ${currentBlock} | ${history.length} days`);
  return history;
}

// ================= PROCESS EVENTS =================

async function processEvents(coreEvents, nftEvents, withdrawEvents, provider, stakingContract, dripContract) {
  const daily = {};
  const cache = new Map();
  const activeUserNFTs = await loadStakes();

  async function getBlock(n) {
    if (!cache.has(n)) cache.set(n, await provider.getBlock(n));
    return cache.get(n);
  }

  // Core stakes
  for (const e of coreEvents) {
    const block = await getBlock(e.blockNumber);
    const day = getDayKey(block.timestamp);
    daily[day] ||= { date: day, coreStaked: 0, nftsStaked: 0 };
    daily[day].coreStaked += Number(ethers.formatEther(e.args.amount || 0));
  }

  // NFT Staked
  for (const e of nftEvents) {
    const user = e.args.user.toLowerCase();
    const collection = e.args.collection;
    const tokenId = e.args.tokenId.toString();

    const block = await getBlock(e.blockNumber);
    const day = getDayKey(block.timestamp);

    daily[day] ||= { date: day, coreStaked: 0, nftsStaked: 0 };
    daily[day].nftsStaked += 1;

    activeUserNFTs[user] ||= [];
    if (!activeUserNFTs[user].some(n => 
      n.nftAddress.toLowerCase() === collection.toLowerCase() && n.tokenId === tokenId)) {
      activeUserNFTs[user].push({ nftAddress: collection, tokenId });
    }
  }

  // NFT Withdrawn
  for (const e of withdrawEvents || []) {
    const user = e.args.user.toLowerCase();
    const collection = e.args.collection;
    const tokenId = e.args.tokenId.toString();

    const block = await getBlock(e.blockNumber);
    const day = getDayKey(block.timestamp);

    daily[day] ||= { date: day, coreStaked: 0, nftsStaked: 0 };
    daily[day].nftsStaked -= 1;

    if (activeUserNFTs[user]) {
      activeUserNFTs[user] = activeUserNFTs[user].filter(
        n => !(n.nftAddress.toLowerCase() === collection.toLowerCase() && n.tokenId === tokenId)
      );
    }
  }

  // Drip rewards
  try {
    if (dripContract) {
      const remainingDrips = await dripContract.remainingDrips();
      const totalDripped = await dripContract.totalDripped();

      const today = getDayKey(Math.floor(Date.now() / 1000));
      if (daily[today]) {
        daily[today].rewardsRemaining = Number(remainingDrips) * 500;
        daily[today].totalDripped = Number(ethers.formatEther(totalDripped));
      }
    }
  } catch (err) {
    console.warn("Could not fetch drip stats:", err.message);
  }

  await saveStakes(structuredClone(activeUserNFTs));

  return { daily, userNFTMap: activeUserNFTs };
}

export async function forceUpdateHistory(stakingContract, dripContract, provider, fromBlock) {
  return fetchStakeHistory(stakingContract, dripContract, provider, { force: true, fromBlock });
}