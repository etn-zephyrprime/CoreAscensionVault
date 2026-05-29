import React from "react";
import Panel from "./Panel.jsx";
import { green, greenGlow } from "../styles/theme.js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function InfoRow({ label, value, highlight = false }) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        fontSize: 13,
      }}
    >
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ color: highlight ? "#ffcc66" : "#fff", fontWeight: 800 }}>
        {value}
      </span>
    </div>
  );
}

function formatNumber(value, decimals = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function VaultIntelligence({ isMobile, vaultData }) {
  const stakeHistory = vaultData?.stakeHistory || [];

  return (
    <div style={{ marginTop: 12 }}>
      <Panel>
        <h2
          style={{
            color: green,
            fontWeight: 900,
            fontSize: isMobile ? 20 : 26,
            textTransform: "uppercase",
            textShadow: `0 0 8px ${greenGlow}`,
            margin: "0 0 16px 0",
          }}
        >
          Vault Intelligence
        </h2>

        {/* Top Info Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <InfoRow label="Reward Schedule" value="5 Sec Blocks" />
          <InfoRow label="Penalty Window" value="60 Days" />
          <InfoRow label="Max Stake" value="10,000 CORE" />
          <InfoRow label="Max NFT Boost" value="1.30x" highlight />
        </div>

        {/* Multi-Metric Growth Chart */}
        <div
          style={{
            background: "#0a0a0a",
            border: "1px solid #333",
            borderRadius: 14,
            padding: "16px 12px 20px 12px",
          }}
        >
          <div
            style={{
              fontSize: 15,
              color: "#ddd",
              fontWeight: 700,
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            VAULT METRICS OVER TIME
          </div>

          <ResponsiveContainer width="100%" height={isMobile ? 300 : 380}>
            <LineChart data={stakeHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="date" stroke="#666" fontSize={12} />
              
              <YAxis yAxisId="core" stroke={green} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="nft" orientation="right" stroke="#ffcc66" />
              <YAxis yAxisId="rewards" orientation="right" stroke="#ff8a3d" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="apy" orientation="left" stroke="#00d4ff" />

              <Tooltip 
                contentStyle={{ backgroundColor: "#111", border: "1px solid #444", borderRadius: 8 }}
                formatter={(value, name) => {
                  if (name === "Rewards Remaining") return [`${value.toLocaleString()} CORE`, name];
                  if (name === "APY %") return [`${value.toFixed(2)}%`, name];
                  return [value.toLocaleString(), name];
                }}
              />
              <Legend />

              <Line yAxisId="core" dataKey="coreStaked" stroke={green} strokeWidth={3.5} name="CORE Staked" />
              <Line yAxisId="nft" dataKey="nftsStaked" stroke="#ffcc66" strokeWidth={3} name="NFTs Staked" />
              <Line yAxisId="rewards" dataKey="rewardsRemaining" stroke="#ff8a3d" strokeWidth={2.8} name="Rewards Remaining" />
              <Line yAxisId="apy" dataKey="currentApr" stroke="#00d4ff" strokeWidth={2.5} name="APY %" />
            </LineChart>
          </ResponsiveContainer>
          </div>

        {/* CORE Burn Section */}
        <div
          style={{
            background: "#0f0f0f",
            border: "1px solid #333",
            borderRadius: 14,
            padding: "18px 20px",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1.2 }}>
            Total CORE Burned
          </div>
          <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: "#ff8a3d", marginTop: 8 }}>
            🔥 {formatNumber(vaultData?.totalCoreBurned, 2)} CORE 🔥
          </div>
        </div>
      </Panel>
    </div>
  );
}