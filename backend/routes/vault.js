import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { fetchStakeHistory } from "../services/stakeHistoryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");

const router = express.Router();

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

// Ensure data directory exists
async function ensureDataDir() {
  const dir = path.dirname(HISTORY_FILE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {}
}

// Get current history
router.get("/stake-history", async (req, res) => {
  try {
    await ensureDataDir();
    const data = await fs.readFile(HISTORY_FILE, "utf8");
    res.json(JSON.parse(data));
  } catch (err) {
    // Return empty structure if file doesn't exist
    res.json({
      lastProcessedBlock: 13853455,
      history: []
    });
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

app.get("/nfts/staked/:wallet", async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();

  const state = await loadHistory(); // reuse same file

  res.json(state.userStakes?.[wallet] || []);
});

export default router;