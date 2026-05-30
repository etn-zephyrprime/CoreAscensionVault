import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "../data/stake-history.json");

const router = express.Router();

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

export default router;