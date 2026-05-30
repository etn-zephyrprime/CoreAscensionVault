// backend/server.js
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import vaultRoutes from "./routes/vault.js";
import { fetchStakeHistory } from "./services/stakeHistoryService.js";
import stakingABI from "./abis/stakingABI.json" with { type: "json" };
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
    "0x3764280F654d780d75463304f1ade8017d6e1cFD", // STAKING_ADDRESS
    stakingABI,
    provider
  );

  // Initial update
  try {
    await fetchStakeHistory(stakingContract, provider);
  } catch (e) {
    console.error("Initial history update failed:", e);
  }

  // Poll every hour (3600000 ms)
  setInterval(async () => {
    if (isUpdating) {
      console.log("⏳ History update already in progress...");
      return;
    }

    isUpdating = true;
    console.log(`\n⏰ [${new Date().toISOString()}] Running hourly history update...`);

    try {
      await fetchStakeHistory(stakingContract, provider);
      console.log("✅ Hourly history update completed successfully");
    } catch (error) {
      console.error("❌ Hourly history update failed:", error);
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