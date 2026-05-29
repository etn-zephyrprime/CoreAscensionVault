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
      <span
        style={{
          color: highlight ? "#ffcc66" : "#fff",
          fontWeight: 800,
        }}
      >
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
  // Sample fallback data - replace with real data from vaultData
  const stakeHistory = vaultData?.stakeHistory || [
    { date: "May 20", coreStaked: 124500, nftsStaked: 87 },
    { date: "May 21", coreStaked: 138200, nftsStaked: 94 },
    { date: "May 22", coreStaked: 142800, nftsStaked: 102 },
    { date: "May 23", coreStaked: 159300, nftsStaked: 118 },
    { date: "May 24", coreStaked: 167400, nftsStaked: 125 },
    { date: "May 25", coreStaked: 178900, nftsStaked: 134 },
    { date: "May 26", coreStaked: 185200, nftsStaked: 141 },
    { date: "May 27", coreStaked: 192700, nftsStaked: 153 },
    { date: "May 28", coreStaked: 201400, nftsStaked: 162 },
  ];

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

        {/* Top row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <InfoRow label="Reward Schedule" value="5 Sec Blocks" />
          <InfoRow label="Penalty Window" value="60 Days" />
          <InfoRow label="Max Stake" value="10,000 CORE" />
          <InfoRow label="Max NFT Boost" value="1.30x" highlight />
        </div>

        {/* Staking Growth Chart */}
        <div
          style={{
            background: "#0a0a0a",
            border: "1px solid #333",
            borderRadius: 14,
            padding: "16px 12px 12px 12px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "#ddd",
              fontWeight: 700,
              marginBottom: 12,
              textAlign: "center",
            }}
          >
            STAKING GROWTH OVER TIME
          </div>

          <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
            <LineChart data={stakeHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis
                dataKey="date"
                stroke="#666"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                yAxisId="core"
                stroke={green}
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="nft"
                orientation="right"
                stroke="#ffcc66"
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111",
                  border: "1px solid #444",
                  borderRadius: 8,
                }}
              />
              <Legend />

              <Line
                yAxisId="core"
                type="natural"
                dataKey="coreStaked"
                stroke={green}
                strokeWidth={3}
                dot={{ fill: green, r: 4 }}
                name="CORE Staked"
              />
              <Line
                yAxisId="nft"
                type="natural"
                dataKey="nftsStaked"
                stroke="#ffcc66"
                strokeWidth={3}
                dot={{ fill: "#ffcc66", r: 4 }}
                name="NFTs Staked"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* CORE Burn row */}
        <div
          style={{
            background: "#0f0f0f",
            border: "1px solid #333",
            borderRadius: 14,
            padding: "18px 20px",
            boxShadow: "0 0 10px rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: 1.2,
              marginBottom: 8,
              lineHeight: 1.4,
            }}
          >
            Total CORE Burned Through Vault
          </div>

          <div
            style={{
              fontSize: isMobile ? 26 : 30,
              fontWeight: 900,
              color: "#ff8a3d",
              textShadow: "0 0 14px rgba(255,138,61,0.35)",
              marginBottom: 8,
              lineHeight: 1,
            }}
          >
            🔥 {formatNumber(vaultData?.totalCoreBurned, 2)} CORE 🔥
          </div>

          <div
            style={{
              fontSize: 13,
              color: "#ffb37a",
              fontWeight: 600,
              maxWidth: 420,
              lineHeight: 1.45,
            }}
          >
            CORE permanently removed through early withdrawal penalties in Core
            Ascension.
          </div>
        </div>
      </Panel>
    </div>
  );
}