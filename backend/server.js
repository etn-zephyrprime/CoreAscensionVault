// backend/server.js
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import vaultRoutes from "./routes/vault.js";           // Make sure path is correct
import { fetchStakeHistory } from "./services/stakeHistoryService.js";

import stakingABI from "../src/abis/stakingABI.json" with { type: "json" };
import dripABI from "../src/abis/dripABI.json" with { type: "json" };

import { RPC_URL, DRIP_FUNDER_ADDRESS, STAKING_ADDRESS } from "./config.js";

const app = express();

app.use(cors());
app.use(express.json());

// ====================== CONTRACT SETUP ======================
const provider = new ethers.JsonRpcProvider(RPC_URL);

const stakingContract = new ethers.Contract(
  STAKING_ADDRESS,
  stakingABI,
  provider
);

const dripContract = new ethers.Contract(
  DRIP_FUNDER_ADDRESS,
  dripABI,
  provider
);

// Make contracts available to routes
app.locals.provider = provider;
app.locals.stakingContract = stakingContract;
app.locals.dripContract = dripContract;

// ====================== ROUTES ======================
app.use("/api/vault", vaultRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "Core Ascension Vault Backend",
  });
});

// ====================== HISTORY POLLER ======================
let isUpdating = false;

async function startHistoryPoller() {
  console.log("🚀 Starting Stake History Poller...");

  // Initial update
  try {
    console.log("🔄 Running initial history update...");
    await fetchStakeHistory(stakingContract, dripContract, provider);
    console.log("✅ Initial history update completed successfully");
  } catch (e) {
    console.error("❌ Initial history update failed:", e.message);
  }

  // Poll every hour
  setInterval(async () => {
    if (isUpdating) {
      console.log("⏳ History update already in progress, skipping...");
      return;
    }

    isUpdating = true;
    console.log(`\n⏰ [${new Date().toISOString()}] Running scheduled history update...`);

    try {
      await fetchStakeHistory(stakingContract, dripContract, provider);
      console.log("✅ Scheduled history update completed");
    } catch (error) {
      console.error("❌ Scheduled history update failed:", error.message);
    } finally {
      isUpdating = false;
    }
  }, 60 * 60 * 1000); // 1 hour
}

// Start everything
startHistoryPoller();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Stake History Poller Active`);
});