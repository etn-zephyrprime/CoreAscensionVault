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

// ================= MAIN FUNCTION =================

export async function fetchStakeHistory(stakingContract, dripContract, provider, options = {}) {
  const { force = false, fromBlock = CONTRACT_CREATION_BLOCK } = options;

  if (!provider) throw new Error("Provider missing");
  if (!stakingContract) throw new Error("stakingContract missing");

  const currentBlock = await provider.getBlockNumber();
  let state = await loadHistory();

  if (force) {
    state = {
      lastProcessedBlock: fromBlock,
      history: [],
      userStakes: {},
    };
  }

  const lastBlock = state.lastProcessedBlock || CONTRACT_CREATION_BLOCK;

  // Skip if we're already up-to-date (within last 30 blocks)
  if (!force && lastBlock >= currentBlock - 30) {
    return state.history;
  }

  const startBlock = lastBlock + 1;

  // Define event filters
  const coreStakeFilter = stakingContract.filters.Staked();
  const nftStakeFilter = stakingContract.filters.NFTStaked();
  const nftWithdrawFilter = stakingContract.filters.NFTWithdrawn();

  console.log(`Fetching events from block ${startBlock} to ${currentBlock}`);

  const [coreEvents, nftEvents, withdrawEvents] = await Promise.all([
    fetchEventsInChunks(stakingContract, coreStakeFilter, startBlock, currentBlock),
    fetchEventsInChunks(stakingContract, nftStakeFilter, startBlock, currentBlock),
    fetchEventsInChunks(stakingContract, nftWithdrawFilter, startBlock, currentBlock),
  ]);

  const { daily, userNFTMap } = await processEvents(
    coreEvents,
    nftEvents,
    withdrawEvents,
    provider,
    stakingContract,
    dripContract
  );

  // ================= MERGE + ADD REWARDS DATA =================
  const map = new Map();

  for (const h of state.history || []) {
    map.set(h.date, { ...h });
  }

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

  // Cumulative NFTs
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

  console.log(`✅ Stake history updated up to block ${currentBlock}`);
  return history;
}

// ================= PROCESS EVENTS =================

async function processEvents(coreEvents, nftEvents, withdrawEvents, provider, stakingContract, dripContract) {
  const daily = {};
  const cache = new Map();

  const activeUserNFTs = await loadStakes();

  async function getBlock(n) {
    if (!cache.has(n)) {
      cache.set(n, await provider.getBlock(n));
    }
    return cache.get(n);
  }

  // CORE STAKES
  for (const e of coreEvents) {
    const block = await getBlock(e.blockNumber);
    const day = getDayKey(block.timestamp);
    daily[day] ||= { date: day, coreStaked: 0, nftsStaked: 0 };
    daily[day].coreStaked += Number(ethers.formatEther(e.args.amount || 0));
  }

  // NFT STAKE
  for (const e of nftEvents) {
    const user = e.args.user.toLowerCase();
    const collection = e.args.collection;
    const tokenId = e.args.tokenId.toString();

    const block = await getBlock(e.blockNumber);
    const day = getDayKey(block.timestamp);

    daily[day] ||= { date: day, coreStaked: 0, nftsStaked: 0 };
    daily[day].nftsStaked += 1;

    activeUserNFTs[user] ||= [];

    const exists = activeUserNFTs[user].some(
      (n) => n.nftAddress.toLowerCase() === collection.toLowerCase() && n.tokenId === tokenId
    );

    if (!exists) {
      activeUserNFTs[user].push({ nftAddress: collection, tokenId });
    }
  }

  // NFT WITHDRAW
  for (const e of withdrawEvents || []) {
    const user = e.args.user.toLowerCase();
    const collection = e.args.collection;
    const tokenId = e.args.tokenId.toString();

    const block = await getBlock(e.blockNumber);
    const day = getDayKey(block.timestamp);

    daily[day] ||= { date: day, coreStaked: 0, nftsStaked: 0 };
    daily[day].nftsStaked -= 1;

    if (!activeUserNFTs[user]) continue;

    activeUserNFTs[user] = activeUserNFTs[user].filter(
      (n) =>
        !(n.nftAddress.toLowerCase() === collection.toLowerCase() && n.tokenId === tokenId)
    );
  }

  // Rewards remaining
  try {
    if (dripContract) {
      const remainingDrips = await dripContract.remainingDrips();
      const totalDripped = await dripContract.totalDripped();

      const remaining = Number(remainingDrips) * 500; // 500 CORE per drip

      const today = getDayKey(Math.floor(Date.now() / 1000));
      if (daily[today]) {
        daily[today].rewardsRemaining = remaining;
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