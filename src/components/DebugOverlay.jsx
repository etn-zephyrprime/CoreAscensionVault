// DebugOverlay.jsx — drop this in your components folder
import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS, DRIP_FUNDER_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json" with { type: "json" };

export default function DebugOverlay({ provider, account }) {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);

  const log = (msg, data) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}${data !== undefined ? ": " + JSON.stringify(data, null, 0) : ""}`;
    setLogs(prev => [entry, ...prev].slice(0, 40));
  };

  useEffect(() => {
    log("provider", !!provider);
    log("account", account ?? "none");
  }, [provider, account]);

  async function runDiag() {
    log("--- DIAG START ---");

    if (!provider) { log("❌ No provider"); return; }
    if (!account)  { log("❌ No account");  return; }

    // 1. Network
    try {
      const net = await provider.getNetwork();
      log("✅ network chainId", Number(net.chainId));
    } catch (e) { log("❌ getNetwork", e.message); return; }

    // 2. Block number
    try {
      const block = await provider.getBlockNumber();
      log("✅ blockNumber", block);
    } catch (e) { log("❌ getBlockNumber", e.message); }

    // 3. ETH balance (proves RPC is alive)
    try {
      const bal = await provider.getBalance(account);
      log("✅ ETH balance", ethers.formatEther(bal));
    } catch (e) { log("❌ getBalance", e.message); }

    // 4. totalCoreStaked
    try {
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);
      const total = await staking.totalCoreStaked();
      log("✅ totalCoreStaked", ethers.formatEther(total));
    } catch (e) { log("❌ totalCoreStaked", e.message); }

    // 5. getUser
    try {
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, provider);
      const user = await staking.getUser(account);
      log("✅ getUser[0] coreStaked", ethers.formatEther(user[0] ?? user.coreStaked ?? 0));
      log("✅ getUser[1] nftCount", String(user[1] ?? user.nftCount ?? "?"));
      log("✅ getUser[4] rewards", ethers.formatEther(user[4] ?? user.pendingRewards ?? 0));
      log("✅ getUser raw", JSON.stringify(user));
    } catch (e) { log("❌ getUser", e.message); }

    log("--- DIAG END ---");
  }

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
      fontFamily: "monospace", fontSize: 11,
    }}>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "absolute", bottom: open ? "auto" : 0, top: open ? 0 : "auto",
          right: 8, padding: "4px 10px",
          background: "#18bb1a", color: "#000", border: "none",
          borderRadius: 4, fontWeight: "bold", cursor: "pointer", zIndex: 10000,
        }}
      >
        {open ? "▼ DEBUG" : "▲ DEBUG"}
      </button>

      {open && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)",
          overflowY: "auto", padding: "40px 8px 8px",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <button
            onClick={runDiag}
            style={{
              padding: "10px 0", background: "#18bb1a", color: "#000",
              border: "none", borderRadius: 6, fontWeight: "bold",
              fontSize: 14, cursor: "pointer", flexShrink: 0,
            }}
          >
            ▶ RUN DIAGNOSTICS
          </button>

          <button
            onClick={() => setLogs([])}
            style={{
              padding: "6px 0", background: "#333", color: "#aaa",
              border: "none", borderRadius: 6, cursor: "pointer", flexShrink: 0,
            }}
          >
            Clear
          </button>

          <div style={{ flexGrow: 1 }}>
            {logs.length === 0 && (
              <div style={{ color: "#666", textAlign: "center", marginTop: 20 }}>
                Tap "RUN DIAGNOSTICS" to start
              </div>
            )}
            {logs.map((l, i) => (
              <div key={i} style={{
                color: l.includes("❌") ? "#ff5555" : l.includes("✅") ? "#18bb1a" : l.includes("---") ? "#ffaa00" : "#ccc",
                padding: "2px 0", borderBottom: "1px solid #111",
                wordBreak: "break-all",
              }}>{l}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}