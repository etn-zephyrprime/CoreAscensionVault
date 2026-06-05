// backend/services/stakeHistoryService.js
import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadLastBlockLocked,
  saveLastBlockLocked,
} from "../utils/blockState.js";

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
      {
        ...data,
        lastUpdated: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`[StakeHistory] Saved ${data.history?.length || 0} entries`);
}

// ===================== HELPERS =====================

function getDayKey(timestamp) {
  return new Date(timestamp * 1000).toISOString().split("T")[0];
}

// ===================== MAIN =====================

export async function fetchStakeHistory(
  stakingContract,
  dripContract,
  provider,
  options = {}
) {
  try {
    const { force = false, fromBlock = CONTRACT_CREATION_BLOCK } = options;

    if (!provider) throw new Error("Provider is undefined");
    if (!stakingContract) throw new Error("stakingContract is undefined");

    const currentBlock = await provider.getBlockNumber();
    let state = await loadHistory();

    if (force) {
      console.log("[StakeHistory] FORCE rebuild");
      state = {
        lastProcessedBlock: fromBlock,
        history: [],
        userStakes: {},
      };
    }

    let lastProcessedBlock =
      state.lastProcessedBlock || CONTRACT_CREATION_BLOCK;

    console.log(
      `[StakeHistory] ${lastProcessedBlock} → ${currentBlock}`
    );

    if (!force && lastProcessedBlock >= currentBlock - 30) {
      return state.history || [];
    }

    // ================= EVENTS =================

    const coreFilter = stakingContract.filters.CoreStaked();
    const nftFilter = stakingContract.filters.NFTStaked();
    const withdrawFilter = stakingContract.filters.NFTWithdrawn?.();

    const coreEvents = [];
    const nftEvents = [];
    const withdrawEvents = [];

    for (
      let from = lastProcessedBlock + 1;
      from <= currentBlock;
      from += CHUNK_SIZE
    ) {
      const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);

      const [c, n, w] = await Promise.all([
        stakingContract.queryFilter(coreFilter, from, to),
        stakingContract.queryFilter(nftFilter, from, to),
        withdrawFilter
          ? stakingContract.queryFilter(withdrawFilter, from, to)
          : [],
      ]);

      coreEvents.push(...c);
      nftEvents.push(...n);
      withdrawEvents.push(...w);
    }

    // ================= PROCESS EVENTS =================

    const { daily, userStakes } = processEvents(
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

    for (const d of Object.values(daily)) {
      const existing = map.get(d.date);

      if (!existing) {
        map.set(d.date, { ...d });
      } else {
        existing.coreStaked =
          (existing.coreStaked || 0) + (d.coreStaked || 0);
        existing.nftsStaked =
          (existing.nftsStaked || 0) + (d.nftsStaked || 0);
      }
    }

    let updatedHistory = Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // ================= TODAY METRICS =================

    const todayKey = getDayKey(Math.floor(Date.now() / 1000));
    let today = updatedHistory.find((x) => x.date === todayKey);

    if (!today) {
      today = { date: todayKey, coreStaked: 0, nftsStaked: 0 };
      updatedHistory.push(today);
    }

    try {
      const [
        totalStakedRaw,
        totalFundedRaw,
        totalPaidRaw,
        rewardPerBlockRaw,
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

      const blocksPerYear = 6307200;

      today.coreStaked = totalStaked;
      today.rewardsRemaining = Math.max(0, totalFunded - totalPaid);
      today.currentApr =
        totalStaked > 0 ? ((rpb * blocksPerYear) / totalStaked) * 100 : 0;
    } catch (e) {
      console.warn("[StakeHistory] metrics failed:", e.message);
    }

    // ================= CUMULATIVE NFT FIX =================

    let running = 0;

    for (const d of updatedHistory) {
      running += d.nftsStaked || 0;
      d.nftsStaked = Math.max(0, running);
    }

    // ================= SAVE STATE =================

    const newState = {
      lastProcessedBlock: currentBlock,
      history: updatedHistory,
      userStakes: userStakes || {},
    };

    await saveHistory(newState);
    await saveLastBlockLocked(
      "stakeHistoryLastBlock",
      currentBlock
    );

    return updatedHistory;
  } catch (err) {
    console.error("[StakeHistory] Fatal error:", err);
    throw err;
  }
}

// ===================== EVENT PROCESSOR =====================

function processEvents(coreEvents, nftEvents, withdrawEvents, provider) {
  const daily = {};
  const userStakes = {};
  const cache = new Map();

  const getBlock = async (n) => {
    if (!cache.has(n)) {
      cache.set(n, await provider.getBlock(n));
    }
    return cache.get(n);
  };

  const pending = [];

  // CORE STAKES
  for (const e of coreEvents) {
    pending.push(
      getBlock(e.blockNumber).then((b) => {
        const day = getDayKey(b.timestamp);
        if (!daily[day]) {
          daily[day] = { date: day, coreStaked: 0, nftsStaked: 0 };
        }
        daily[day].coreStaked += Number(
          ethers.formatEther(e.args.amount || 0)
        );
      })
    );
  }

  // NFT STAKES
  for (const e of nftEvents) {
    pending.push(
      getBlock(e.blockNumber).then((b) => {
        const user = e.args.user.toLowerCase();
        const day = getDayKey(b.timestamp);

        if (!daily[day]) {
          daily[day] = { date: day, coreStaked: 0, nftsStaked: 0 };
        }

        daily[day].nftsStaked += 1;

        if (!userStakes[user]) userStakes[user] = [];

        userStakes[user].push({
          nftAddress: e.args.collection,
          tokenId: e.args.tokenId.toString(),
        });
      })
    );
  }

  // NFT WITHDRAWALS
  for (const e of withdrawEvents || []) {
    pending.push(
      getBlock(e.blockNumber).then((b) => {
        const user = e.args.user.toLowerCase();
        const day = getDayKey(b.timestamp);

        if (!daily[day]) {
          daily[day] = { date: day, coreStaked: 0, nftsStaked: 0 };
        }

        daily[day].nftsStaked -= 1;

        const list = userStakes[user];
        if (list) {
          userStakes[user] = list.filter(
            (n) =>
              !(
                n.nftAddress.toLowerCase() ===
                  e.args.collection.toLowerCase() &&
                n.tokenId === e.args.tokenId.toString()
              )
          );
        }
      })
    );
  }

  return {
    daily,
    userStakes,
  };
}

// ===================== FORCE =====================

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