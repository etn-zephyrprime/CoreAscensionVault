// backend/server.js
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import vaultRoutes from "./routes/vault.js";
import { fetchStakeHistory } from "./services/stakeHistoryService.js";
import stakingABI from "../src/abis/stakingABI.json" with { type: "json" };
import dripABI from "../src/abis/dripABI.json" with { type: "json" };
import { DRIP_FUNDER_ADDRESS } from "./config.js";   // or wherever it's defined
import { RPC_URL } from "./config.js";            // Your RPC

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/vault", vaultRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "Core Ascension Vault Backend",
    message: "Server is running"
  });
});

// ====================== POLLING SETUP ======================
let isUpdating = false;

async function startHistoryPoller() {
  console.log("🚀 Starting Stake History Poller (every 1 hour)");

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const stakingContract = new ethers.Contract(
    "0x200A9b5Fe78d4cB5232a3A0C52B510F961C51Cd6",
    stakingABI,
    provider
  );

  const dripContract = new ethers.Contract(
    DRIP_FUNDER_ADDRESS,   // Make sure this is imported/defined
    dripABI,
    provider
  );

  // Initial update
  try {
    await fetchStakeHistory(stakingContract, dripContract, provider);
    console.log("✅ Initial history update completed");
  } catch (e) {
    console.error("❌ Initial history update failed:", e.message);
  }

  // Poll every hour
  setInterval(async () => {
    if (isUpdating) {
      console.log("⏳ History update already in progress...");
      return;
    }

    isUpdating = true;
    console.log(`\n⏰ [${new Date().toISOString()}] Running hourly history update...`);

    try {
      await fetchStakeHistory(stakingContract, dripContract, provider);
      console.log("✅ Hourly history update completed successfully");
    } catch (error) {
      console.error("❌ Hourly history update failed:", error.message);
    } finally {
      isUpdating = false;
    }
  }, 60 * 60 * 1000); // 1 hour
}

// Start the poller when server starts
startHistoryPoller();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Stake History Poller Active (1 hour interval)`);
});