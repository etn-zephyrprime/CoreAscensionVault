import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { loadLastBlockLocked, saveLastBlockLocked } from "../utils/blockState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");

const CONTRACT_CREATION_BLOCK = 13853455;
const CHUNK_SIZE = 250;

const STAKES_FILE = path.join(__dirname, "../data/current-stakes.json");

// ================= FILE HELPERS =================

async function ensureDataDir() {
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true }).catch(() => {});
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
    JSON.stringify(
      { ...data, lastUpdated: new Date().toISOString() },
      null,
      2
    )
  );
}

async function ensureDataDir() {
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true }).catch(() => {});
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

// ================= MAIN =================

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

  if (!force && lastBlock >= currentBlock - 30) {
    return state.history;
  }

  const coreFilter = stakingContract.filters.CoreStaked();
  const nftFilter = stakingContract.filters.NFTStaked();
  const nftWithdrawFilter = stakingContract.filters.NFTWithdrawn?.();

  const coreEvents = [];
  const nftEvents = [];
  const withdrawEvents = [];

  for (let from = lastBlock + 1; from <= currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);

    const [core, nft, wd] = await Promise.all([
      stakingContract.queryFilter(coreFilter, from, to),
      stakingContract.queryFilter(nftFilter, from, to),
      nftWithdrawFilter ? stakingContract.queryFilter(nftWithdrawFilter, from, to) : [],
    ]);

    coreEvents.push(...core);
    nftEvents.push(...nft);
    withdrawEvents.push(...wd);
  }

  const { daily, userNFTMap } = await processEvents(
    coreEvents,
    nftEvents,
    withdrawEvents,
    provider
  );

  // ================= MERGE HISTORY =================

  const map = new Map();

  for (const h of state.history || []) {
    map.set(h.date, { ...h });
  }

  for (const day of Object.values(daily)) {
    const existing = map.get(day.date);

    if (!existing) {
      map.set(day.date, day);
    } else {
      existing.coreStaked = (existing.coreStaked || 0) + (day.coreStaked || 0);
      existing.nftsStaked = (existing.nftsStaked || 0) + (day.nftsStaked || 0);
    }
  }

  const history = Array.from(map.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // cumulative NFTs
  let running = 0;
  for (const d of history) {
    running += d.nftsStaked || 0;
    d.nftsStaked = Math.max(0, running);
  }

  const newState = {
    lastProcessedBlock: currentBlock,
    history,
    userStakes: userNFTMap,
  };

  await saveHistory(newState);
  await saveLastBlockLocked("stakeHistoryLastBlock", currentBlock);

  return history;
}

// ================= EVENT PROCESSOR =================
async function processEvents(coreEvents, nftEvents, withdrawEvents, provider) {
  const daily = {};
  const cache = new Map();

  // 👇 LIVE STATE (authoritative)
  const activeUserNFTs = await loadStakes();

  async function getBlock(n) {
    if (!cache.has(n)) {
      cache.set(n, await provider.getBlock(n));
    }
    return cache.get(n);
  }

  // CORE (unchanged)
  for (const e of coreEvents) {
    const block = await getBlock(e.blockNumber);
    const day = getDayKey(block.timestamp);

    daily[day] ||= { date: day, coreStaked: 0, nftsStaked: 0 };

    daily[day].coreStaked += Number(ethers.formatEther(e.args.amount || 0));
  }

  // NFT STAKE → ADD
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
      (n) =>
        n.nftAddress.toLowerCase() === collection.toLowerCase() &&
        n.tokenId === tokenId
    );

    if (!exists) {
      activeUserNFTs[user].push({
        nftAddress: collection,
        tokenId,
      });
    }
  }

  // NFT WITHDRAW → REMOVE
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
        !(
          n.nftAddress.toLowerCase() === collection.toLowerCase() &&
          n.tokenId === tokenId
        )
    );
  }

  // 👇 SAVE LIVE STATE
  await saveStakes(activeUserNFTs);

  return { daily, activeUserNFTs };
}

export async function forceUpdateHistory(stakingContract, dripContract, provider, fromBlock) {
  return fetchStakeHistory(stakingContract, dripContract, provider, {
    force: true,
    fromBlock,
  });
}