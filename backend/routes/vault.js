import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { fetchStakeHistory, forceUpdateHistory, buildWeeklyRollingHistory } from "../services/stakeHistoryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");
const STAKES_FILE = path.join(__dirname, "../data/staked-nfts.json");   // ← Added

const router = express.Router();

// Ensure data directory exists
async function ensureDataDir() {
  const dir = path.dirname(HISTORY_FILE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {}
}

// Example: backend/routes/api/vault.js  (or wherever your endpoint is)
export async function getStakeHistory(req, res) {
  try {
    const { provider, stakingContract, dripContract } = req.app.locals; // or however you pass contracts

    if (!stakingContract || !dripContract) {
      return res.status(500).json({ error: "Contracts not initialized" });
    }

    const history = await fetchStakeHistory(stakingContract, dripContract, provider);

    res.json({
      history: history,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    console.error("Stake history endpoint failed:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
}

// Temporary force route
export async function forceRefreshHistory(req, res) {
  try {
    const { stakingContract, dripContract, provider } = req.app.locals;
    const history = await forceUpdateHistory(stakingContract, dripContract, provider);
    res.json({ success: true, historyLength: history.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get("/stake-history", async (req, res) => {
  try {
    const { stakingContract, dripContract, provider } = req.app.locals;

    const history = await fetchStakeHistory(
      stakingContract,
      dripContract,
      provider
    );

    const weeklyHistory = buildWeeklyRollingHistory(history);

    res.json({
      history,
      weeklyHistory,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Update history (called by your frontend or a cron job)
router.post("/stake-history/update", async (req, res) => {
  try {
    const { lastProcessedBlock, history } = req.body;

    await ensureDataDir();

    const payload = {
      lastProcessedBlock: lastProcessedBlock || 13853455,
      history: history || [],
      lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(HISTORY_FILE, JSON.stringify(payload, null, 2));

    res.json({ success: true, message: "History updated", block: lastProcessedBlock });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save history" });
  }
});

router.get("/nfts/staked/:wallet", async (req, res) => {
  try {
    const wallet = req.params.wallet.toLowerCase();
    await ensureDataDir();

    // Try to read from the seeded file
    let data;
    try {
      data = await fs.readFile(STAKES_FILE, "utf8");
    } catch (e) {
      // Fallback to history file if stakes file doesn't exist yet
      data = await fs.readFile(HISTORY_FILE, "utf8");
    }

    const state = JSON.parse(data);

    // Support both possible structures
    const staked = state[wallet] || state.userStakes?.[wallet] || [];
    console.log(`Staked NFTs for ${wallet}:`, staked);

    res.json(staked);
  } catch (err) {
    console.error("staked nft route failed:", err);
    res.json([]);
  }
});

router.post("/admin/seed-stakes", async (req, res) => {
  try {
    await ensureDataDir();
    await fs.writeFile(STAKES_FILE, JSON.stringify(req.body, null, 2));
    console.log("✅ Stakes seeded successfully");
    res.json({ success: true, message: "Stakes seeded" });
  } catch (err) {
    console.error("Seed stakes error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;