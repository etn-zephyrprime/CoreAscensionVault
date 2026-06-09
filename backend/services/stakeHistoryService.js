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
const BLOCKS_PER_DAY = 86400 / 5; // 17280 — 5-second blocks

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

// ================= GAP FILL =================
// For any date with no events or snapshot, carry forward the previous day's
// values so there is a row for every calendar day.

function fillDateGaps(history) {
  if (history.length < 2) return history;

  const filled = [];
  for (let i = 0; i < history.length; i++) {
    filled.push(history[i]);

    if (i < history.length - 1) {
      const current = new Date(history[i].date);
      const next = new Date(history[i + 1].date);
      const diffDays = Math.round((next - current) / 86400000);

      for (let d = 1; d < diffDays; d++) {
        const missingDate = new Date(current);
        missingDate.setDate(current.getDate() + d);
        const dateKey = missingDate.toISOString().split("T")[0];
        // Carry forward previous day — rewardsRemaining will be
        // corrected by backfillRewardsRemaining immediately after
        filled.push({ ...history[i], date: dateKey });
      }
    }
  }
  return filled;
}

// ================= REWARDS BACKFILL =================
// For gap-filled entries (no real snapshot), calculate rewardsRemaining
// by subtracting the known daily emission from the previous real value.
// This gives a realistic declining curve rather than a flat line.

function backfillRewardsRemaining(history, rewardPerBlock) {
  const rewardPerBlockEth = Number(ethers.formatEther(rewardPerBlock));
  const dailyEmission = rewardPerBlockEth * BLOCKS_PER_DAY;

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];

    // Only correct entries that were gap-filled (same rewardsRemaining as prev)
    if (curr.rewardsRemaining === prev.rewardsRemaining && curr.date !== prev.date) {
      const daysBetween = Math.round(
        (new Date(curr.date) - new Date(prev.date)) / 86400000
      );
      curr.rewardsRemaining = Math.max(
        0,
        Number((prev.rewardsRemaining - dailyEmission * daysBetween).toFixed(2))
      );
    }
  }
  return history;
}

// ================= APR RECALCULATION =================
// Recalculates APR for every entry using that day's own coreStaked so
// APR correctly reflects the pool size on each specific day.

function recalculateHistoricalApr(history, rewardPerBlock) {
  const rewardPerBlockEth = Number(ethers.formatEther(rewardPerBlock));
  for (const d of history) {
    if (d.coreStaked > 0) {
      d.currentApr = Number(
        ((rewardPerBlockEth * 6307200) / d.coreStaked * 100).toFixed(2)
      );
    } else {
      d.currentApr = 0;
    }
  }
  return history;
}

// ================= ENRICH HISTORY =================
// Runs gap fill → rewards backfill → APR recalc in one place
// so both code paths stay in sync.

async function enrichHistory(history, stakingContract) {
  history = fillDateGaps(history);
  try {
    const rewardPerBlock = await stakingContract.rewardPerBlock();
    history = backfillRewardsRemaining(history, rewardPerBlock);
    history = recalculateHistoricalApr(history, rewardPerBlock);
  } catch (e) {
    console.warn("Could not enrich history:", e.message);
  }
  return history;
}

// ================= DAILY SNAPSHOT =================
// Always writes today's entry with live on-chain values.
// Returns the full history map so callers can continue merging.

async function upsertDailySnapshot(state, stakingContract) {
  const today = getDayKey(Math.floor(Date.now() / 1000));
  const map = new Map(state.history?.map(h => [h.date, { ...h }]) || []);

  try {
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

    const existing = map.get(today) || { date: today, nftsStaked: 0 };
    map.set(today, {
      ...existing,
      date: today,
      coreStaked: Number(totalStaked.toFixed(2)),
      totalCoreStaked: Number(totalStaked.toFixed(2)),
      rewardsRemaining: Number(rewardsRemaining.toFixed(2)),
      currentApr: Number(currentApr.toFixed(2)),
    });

    console.log(`📸 Snapshot ${today}: coreStaked=${totalStaked.toFixed(2)}, rewardsRemaining=${rewardsRemaining.toFixed(2)}, apr=${currentApr.toFixed(2)}`);
  } catch (err) {
    console.warn("Could not take daily snapshot:", err.message);
  }

  return map;
}

// ================= MAIN FUNCTION =================

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

  // Always write today's snapshot with live chain data first
  const map = await upsertDailySnapshot(state, stakingContract);

  // Skip event processing if no new blocks — still save snapshot + enrich
  if (!force && lastBlock >= currentBlock - 30) {
    let history = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    history = await enrichHistory(history, stakingContract);
    const newState = { ...state, history, lastUpdated: new Date().toISOString() };
    await saveHistory(newState);
    console.log(`📸 Snapshot only — no new blocks to process`);
    return history;
  }

  // Full event processing
  const startBlock = lastBlock + 1;
  console.log(`🔄 Fetching events from block ${startBlock} to ${currentBlock}`);

  const [coreEvents, nftEvents, withdrawEvents] = await Promise.all([
    fetchEventsInChunks(stakingContract, stakingContract.filters.CoreStaked(), startBlock, currentBlock),
    fetchEventsInChunks(stakingContract, stakingContract.filters.NFTStaked(), startBlock, currentBlock),
    fetchEventsInChunks(stakingContract, stakingContract.filters.NFTWithdrawn(), startBlock, currentBlock),
  ]);

  const { daily, userNFTMap } = await processEvents(
    coreEvents, nftEvents, withdrawEvents,
    provider, stakingContract, dripContract
  );

  // Merge event data — today keeps snapshot value; past days accumulate deltas
  const todayKey = getDayKey(Math.floor(Date.now() / 1000));
  for (const day of Object.values(daily)) {
    const existing = map.get(day.date) || {};
    map.set(day.date, {
      ...existing,
      ...day,
      coreStaked: day.date === todayKey
        ? (existing.coreStaked ?? 0)
        : (existing.coreStaked ?? 0) + (day.coreStaked ?? 0),
      rewardsRemaining: day.rewardsRemaining !== undefined
        ? day.rewardsRemaining
        : (existing.rewardsRemaining || 0),
    });
  }

  let history = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Cumulative NFT count (nftsStaked from events is a delta)
  let runningNfts = 0;
  for (const d of history) {
    runningNfts += d.nftsStaked || 0;
    d.nftsStaked = Math.max(0, runningNfts);
  }

  // Fill gaps, backfill rewards, recalculate APR
  history = await enrichHistory(history, stakingContract);

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

  // Core stakes — accumulate event deltas per day
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
      n.nftAddress.toLowerCase() === collection.toLowerCase() && n.tokenId === tokenId
    )) {
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

  // Drip rewards — use DRIP_AMOUNT from contract, never a hardcoded value
  try {
    if (dripContract) {
      const [remainingDrips, totalDripped, dripAmount] = await Promise.all([
        dripContract.remainingDrips(),
        dripContract.totalDripped(),
        dripContract.DRIP_AMOUNT(),
      ]);
      const today = getDayKey(Math.floor(Date.now() / 1000));
      if (daily[today]) {
        daily[today].rewardsRemaining = Number(ethers.formatEther(
          BigInt(remainingDrips) * dripAmount
        ));
        daily[today].totalDripped = Number(ethers.formatEther(totalDripped));
      }
    }
  } catch (err) {
    console.warn("Could not fetch drip stats:", err.message);
  }

  await saveStakes(structuredClone(activeUserNFTs));
  return { daily, userNFTMap: activeUserNFTs };
}

// ================= FORCE REBUILD =================

export async function forceUpdateHistory(stakingContract, dripContract, provider, fromBlock) {
  return fetchStakeHistory(stakingContract, dripContract, provider, { force: true, fromBlock });
}