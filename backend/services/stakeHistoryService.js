import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { loadLastBlockLocked, saveLastBlockLocked } from "../utils/blockState.js";
import { pullHistoryFromGitHub, pushHistoryToGitHub } from "../utils/githubSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");
const STAKES_FILE = path.join(__dirname, "../data/current-stakes.json");

const CONTRACT_CREATION_BLOCK = 13853455;
const CHUNK_SIZE = 250;
const MIN_CHUNK_SIZE = 10;
const CHUNK_RETRY_DELAY_MS = 500;
const MAX_TRANSIENT_RETRIES = 3;
const BLOCKS_PER_DAY = 86400 / 5; // 17280 — 5-second blocks

// ================= FILE HELPERS =================

async function ensureDataDir() {
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true }).catch(() => {});
  await fs.mkdir(path.dirname(STAKES_FILE), { recursive: true }).catch(() => {});
}

async function loadHistory() {
  // Try local file first (warm instance — fast path)
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.history?.length > 0) return parsed;
  } catch {}

  // Cold start or empty local file — pull latest from GitHub
  console.log("📥 Local history empty, pulling from GitHub...");
  const remote = await pullHistoryFromGitHub();
  if (remote?.content) {
    await ensureDataDir();
    await fs.writeFile(HISTORY_FILE, JSON.stringify(remote.content, null, 2));
    console.log(`📥 Seeded local file with ${remote.content.history?.length ?? 0} days from GitHub`);
    return remote.content;
  }

  // Nothing anywhere — fresh start
  return {
    lastProcessedBlock: CONTRACT_CREATION_BLOCK,
    history: [],
    userStakes: {},
    lastUpdated: new Date().toISOString(),
  };
}

async function saveHistory(data) {
  const payload = { ...data, lastUpdated: new Date().toISOString() };

  await ensureDataDir();

  await fs.writeFile(
    HISTORY_FILE,
    JSON.stringify(payload, null, 2)
  );

  console.log(
    `💾 Saved ${payload.history?.length} days locally, pushing to GitHub...`
  );

  try {
    await pushHistoryToGitHub(payload);
  } catch (e) {
    console.error("❌ GitHub push failed:", e.message);
  }
}

// ================= DATE =================

function getDayKey(ts) {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

// ================= EVENT FETCHING =================
//
// After the service has been down for a while, there can be tens of
// thousands of blocks to catch up on. Two failure modes show up here:
//
//   1. The RPC rejects a request with "Batch size too large" (HTTP 413).
//      This happens because ethers can bundle multiple in-flight JSON-RPC
//      calls into one HTTP batch request. Running several event-type
//      fetches concurrently (Promise.all) makes this worse, so those are
//      now run sequentially in fetchStakeHistory below.
//   2. A chunk fails for a transient reason (timeout, rate limit, etc).
//
// In both cases we retry instead of silently skipping the range — silently
// skipping means those events are gone from history forever, even though
// lastProcessedBlock still advances past them.

// Shared across all event-type fetches in a run: once we learn the RPC is
// rejecting requests at the current size, subsequent fetches (core, NFT
// staked, NFT withdrawn) start smaller instead of re-discovering the limit
// independently each time.
let adaptiveChunkSize = CHUNK_SIZE;

function isBatchTooLargeError(err) {
  const msg = err?.message || "";
  const info = err?.info?.responseBody || "";
  return (
    err?.code === 413 ||
    /413/.test(msg) ||
    /batch size too large/i.test(msg) ||
    /batch size too large/i.test(String(info))
  );
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchChunkWithRetry(contract, filter, start, end, depth = 0) {
  try {
    return await contract.queryFilter(filter, start, end);
  } catch (err) {
    const rangeSize = end - start + 1;

    if (isBatchTooLargeError(err) && rangeSize > MIN_CHUNK_SIZE) {
      // Shrink the shared chunk size so later chunks in this run (and any
      // event-type fetch that runs after this one) request less too.
      adaptiveChunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(rangeSize / 2));
      console.warn(
        `⚠️ Batch too large for ${start}-${end} (size ${rangeSize}), splitting in half and retrying...`
      );

      await sleep(CHUNK_RETRY_DELAY_MS);

      const mid = start + Math.floor(rangeSize / 2) - 1;
      const firstHalf = await fetchChunkWithRetry(contract, filter, start, mid, depth + 1);
      const secondHalf = await fetchChunkWithRetry(contract, filter, mid + 1, end, depth + 1);
      return [...firstHalf, ...secondHalf];
    }

    if (depth < MAX_TRANSIENT_RETRIES) {
      console.warn(`Retrying chunk ${start}-${end} after error: ${err.message}`);
      await sleep(CHUNK_RETRY_DELAY_MS * (depth + 1));
      return fetchChunkWithRetry(contract, filter, start, end, depth + 1);
    }

    // Out of retries — throw instead of dropping the range. The caller
    // must not advance lastProcessedBlock or save state if this happens,
    // or these events are lost permanently.
    throw new Error(`Failed to fetch events for blocks ${start}-${end} after retries: ${err.message}`);
  }
}

async function fetchEventsInChunks(contract, filter, fromBlock, toBlock) {
  const events = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const size = Math.min(adaptiveChunkSize, CHUNK_SIZE);
    const end = Math.min(start + size - 1, toBlock);
    console.log(`Fetching events from ${start} to ${end}...`);

    const chunkEvents = await fetchChunkWithRetry(contract, filter, start, end);
    events.push(...chunkEvents);

    // Slowly recover chunk size after sustained success, so a temporary
    // dip doesn't cripple throughput for the rest of a long catch-up run.
    if (adaptiveChunkSize < CHUNK_SIZE) {
      adaptiveChunkSize = Math.min(CHUNK_SIZE, Math.floor(adaptiveChunkSize * 1.5));
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
    if (d.currentApr !== undefined) {
      continue;
    }

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

  // In fetchStakeHistory, snapshot-only path — update lastProcessedBlock:
  if (!force && lastBlock >= currentBlock - 30) {
    let history = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    history = await enrichHistory(history, stakingContract);
    const newState = {
      ...state,
      lastProcessedBlock: currentBlock,  // 👈 update this so next run isn't stale
      history,
      lastUpdated: new Date().toISOString(),
    };
    await saveHistory(newState);
    console.log(`📸 Snapshot only — processed to block ${currentBlock}`);
    return history;
  }

  // Full event processing
  const startBlock = lastBlock + 1;
  console.log(`🔄 Fetching events from block ${startBlock} to ${currentBlock}`);

  let coreEvents, nftEvents, withdrawEvents;
  try {
    // Sequential, not Promise.all — running these concurrently is what
    // causes ethers to bundle multiple eth_getLogs calls into one
    // oversized HTTP batch request, which is what triggers "Batch size
    // too large" once there's a big backlog after downtime. If your RPC
    // provider supports raising the batch limit or you construct the
    // provider with `batchMaxCount: 1`, these could safely go back to
    // Promise.all for more throughput.
    coreEvents = await fetchEventsInChunks(
      stakingContract, stakingContract.filters.CoreStaked(), startBlock, currentBlock
    );
    nftEvents = await fetchEventsInChunks(
      stakingContract, stakingContract.filters.NFTStaked(), startBlock, currentBlock
    );
    withdrawEvents = await fetchEventsInChunks(
      stakingContract, stakingContract.filters.NFTWithdrawn(), startBlock, currentBlock
    );
  } catch (err) {
    // Do NOT save state or advance lastProcessedBlock here — if we did,
    // the unprocessed block range would be skipped forever since the next
    // run would start from currentBlock. Better to leave lastProcessedBlock
    // where it was and retry the whole range next time this job runs.
    console.error(`❌ Event fetch failed, aborting this run without advancing lastProcessedBlock: ${err.message}`);
    throw err;
  }

  const { daily, userNFTMap } = await processEvents(
    coreEvents, nftEvents, withdrawEvents,
    provider, stakingContract, dripContract
  );

  // Merge event data — today keeps snapshot value; past days accumulate deltas
  const todayKey = getDayKey(Math.floor(Date.now() / 1000));
  for (const day of Object.values(daily)) {
    const existing = map.get(day.date) || {};
    map.set(day.date, {
      ...day,
      ...existing,
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
    // only add the daily delta
    runningNfts += Number(d.nftsStakedDelta || 0);
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

async function loadStakes() {
  try {
    const raw = await fs.readFile(STAKES_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    await ensureDataDir();
    return {};
  }
}

async function saveStakes(data) {
  await ensureDataDir();
  await fs.writeFile(STAKES_FILE, JSON.stringify(data, null, 2));
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
    daily[day].nftsStakedDelta = (daily[day].nftsStakedDelta || 0) + 1;

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
    daily[day].nftsStakedDelta = (daily[day].nftsStakedDelta || 0) - 1;

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

// ================= WEEKLY AGGREGATION =================
export function buildWeeklyRollingHistory(dailyHistory) {
  const weekly = [];
  let currentIndex = -1;

  for (const entry of dailyHistory) {
    const date = new Date(entry.date);
    const isMonday = date.getDay() === 1;

    if (isMonday || weekly.length === 0) {
      weekly.push({
        ...entry,
        snapshotDate: entry.date
      });
      currentIndex++;
    } else {
      weekly[currentIndex] = {
        ...entry,
        snapshotDate: entry.date
      };
    }
  }

  return weekly;
}

// ================= FORCE REBUILD =================

export async function forceUpdateHistory(stakingContract, dripContract, provider, fromBlock) {
  return fetchStakeHistory(stakingContract, dripContract, provider, { force: true, fromBlock });
}