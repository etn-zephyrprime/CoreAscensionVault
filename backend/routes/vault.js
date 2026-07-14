import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { forceUpdateHistory, buildWeeklyRollingHistory } from "../services/stakeHistoryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");
const STAKES_FILE = path.join(__dirname, "../data/staked-nfts.json");

const router = express.Router();

// Ensure data directory exists
async function ensureDataDir() {
  const dir = path.dirname(HISTORY_FILE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {}
}

// Read cached stake history only
router.get("/stake-history", async (req, res) => {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    const state = JSON.parse(raw);

    res.json({
      history: state.history ?? [],
      weeklyHistory: buildWeeklyRollingHistory(state.history ?? []),
      lastUpdated: state.lastUpdated,
    });
  } catch (err) {
    console.error("Failed to read stake history:", err);
    res.status(500).json({ error: "Failed to read history" });
  }
});

// Force rebuild history (admin use)
export async function forceRefreshHistory(req, res) {
  try {
    const { stakingContract, dripContract, provider } = req.app.locals;

    const history = await forceUpdateHistory(
      stakingContract,
      dripContract,
      provider
    );

    res.json({
      success: true,
      historyLength: history.length,
    });
  } catch (err) {
    console.error("Force refresh failed:", err);
    res.status(500).json({ error: err.message });
  }
}

// Update history cache (optional/manual)
router.post("/stake-history/update", async (req, res) => {
  try {
    const { lastProcessedBlock, history } = req.body;

    await ensureDataDir();

    const payload = {
      lastProcessedBlock: lastProcessedBlock || 13853455,
      history: history || [],
      lastUpdated: new Date().toISOString(),
    };

    await fs.writeFile(HISTORY_FILE, JSON.stringify(payload, null, 2));

    res.json({
      success: true,
      message: "History updated",
      block: lastProcessedBlock,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save history" });
  }
});

// Get staked NFTs for a wallet
router.get("/nfts/staked/:wallet", async (req, res) => {
  try {
    const wallet = req.params.wallet.toLowerCase();

    await ensureDataDir();

    let data;
    try {
      data = await fs.readFile(STAKES_FILE, "utf8");
    } catch {
      data = await fs.readFile(HISTORY_FILE, "utf8");
    }

    const state = JSON.parse(data);

    const staked = state[wallet] || state.userStakes?.[wallet] || [];

    console.log(`Staked NFTs for ${wallet}:`, staked);

    res.json(staked);
  } catch (err) {
    console.error("staked nft route failed:", err);
    res.json([]);
  }
});

// Seed stake cache
router.post("/admin/seed-stakes", async (req, res) => {
  try {
    await ensureDataDir();

    await fs.writeFile(STAKES_FILE, JSON.stringify(req.body, null, 2));

    console.log("✅ Stakes seeded successfully");

    res.json({
      success: true,
      message: "Stakes seeded",
    });
  } catch (err) {
    console.error("Seed stakes error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;