import React, { useState } from "react";
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

function ToggleButton({ label, color, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 16px",
        borderRadius: 20,
        border: `2px solid ${isActive ? color : "#555"}`,
        background: isActive ? "#1a1a1a" : "transparent",
        color: isActive ? "#fff" : "#aaa",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      {isActive ? "●" : "○"} {label}
    </button>
  );
}

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

  const [visibleLines, setVisibleLines] = useState({
    coreStaked: true,
    rewardsRemaining: true,
    currentApr: true,
  });

  const toggleLine = (line) => {
    setVisibleLines((prev) => ({
      ...prev,
      [line]: !prev[line],
    }));
  };

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
    padding: isMobile ? "16px 12px 20px 12px" : "20px 16px 24px 16px",
  }}
>
  <div
    style={{
      fontSize: 15,
      color: "#ddd",
      fontWeight: 700,
      marginBottom: isMobile ? 14 : 18,
      textAlign: "center",
    }}
  >
    CORE ASCENSION METRICS OVER TIME
  </div>

  {/* Toggle Buttons - Better mobile layout */}
  <div style={{ 
    display: "flex", 
    justifyContent: "center", 
    gap: isMobile ? "8px" : "12px", 
    flexWrap: "wrap",
    marginBottom: isMobile ? 14 : 18 
  }}>
    <ToggleButton 
      label="CORE Staked" 
      color={green} 
      isActive={visibleLines.coreStaked}
      onClick={() => toggleLine('coreStaked')}
    />
    <ToggleButton 
      label="Rewards Remaining" 
      color="#ff8a3d" 
      isActive={visibleLines.rewardsRemaining}
      onClick={() => toggleLine('rewardsRemaining')}
    />
    <ToggleButton 
      label="APY %" 
      color="#00d4ff" 
      isActive={visibleLines.currentApr}
      onClick={() => toggleLine('currentApr')}
    />
  </div>

  <ResponsiveContainer width="100%" height={isMobile ? 300 : 420}>
    <LineChart 
      data={stakeHistory} 
      margin={{ 
        top: 10, 
        right: isMobile ? 10 : 30, 
        left: isMobile ? 0 : 10, 
        bottom: 10 
      }}
    >
      <CartesianGrid strokeDasharray="3 3" stroke="#222" />

      <XAxis 
        dataKey="date" 
        stroke="#666" 
        fontSize={isMobile ? 10 : 12}
        tickLine={false}
        axisLine={{ stroke: "#444" }}
      />

      <YAxis 
        yAxisId="left" 
        stroke={green} 
        tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
        fontSize={isMobile ? 10 : 11}
      />

      <YAxis 
        yAxisId="right" 
        orientation="right" 
        stroke="#00d4ff"
        fontSize={isMobile ? 10 : 11}
      />

      <Tooltip 
        contentStyle={{ 
          backgroundColor: "#111", 
          border: "1px solid #555", 
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: isMobile ? 12 : 13
        }}
      />

      <Legend />

      {visibleLines.coreStaked && (
        <Line 
          yAxisId="left" 
          dataKey="coreStaked" 
          stroke={green} 
          strokeWidth={isMobile ? 3.5 : 4.5} 
          dot={{ r: isMobile ? 4 : 5, fill: green }}
          activeDot={{ r: 7 }}
          name="CORE Staked" 
          connectNulls={true}
        />
      )}

      {visibleLines.rewardsRemaining && (
        <Line 
          yAxisId="left" 
          dataKey="rewardsRemaining" 
          stroke="#ff8a3d" 
          strokeWidth={isMobile ? 2.5 : 3} 
          strokeDasharray="6 3"
          dot={{ r: isMobile ? 3.5 : 4, fill: "#ff8a3d" }}
          name="Rewards Remaining" 
          connectNulls={true}
        />
      )}

      {visibleLines.currentApr && (
        <Line 
          yAxisId="right" 
          dataKey="currentApr" 
          stroke="#00d4ff" 
          strokeWidth={isMobile ? 2.5 : 3} 
          strokeDasharray="4 3"
          dot={{ r: isMobile ? 3.5 : 4, fill: "#00d4ff" }}
          name="APY %" 
          connectNulls={true}
        />
      )}
    </LineChart>
  </ResponsiveContainer>
</div>

        {/* CORE Burn Section */}
        <div
          style={{
            background: "#0f0f0f",
            border: "1px solid #333",
            borderRadius: 14,
            padding: "20px 24px",
            marginTop: 16,
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
            }}
          >
            TOTAL CORE BURNED THROUGH CORE ASCENSION
          </div>

          <div
            style={{
              fontSize: isMobile ? 28 : 34,
              fontWeight: 900,
              color: "#ff8a3d",
              textShadow: "0 0 15px rgba(255,138,61,0.4)",
              marginBottom: 10,
              lineHeight: 1,
            }}
          >
            🔥 {formatNumber(vaultData?.totalCoreBurned, 2)} CORE 🔥
          </div>

          <div
            style={{
              fontSize: 13,
              color: "#ffb37a",
              fontWeight: 500,
              maxWidth: 460,
              margin: "0 auto",
              lineHeight: 1.45,
            }}
          >
            CORE permanently removed through early withdrawal penalties in Core Ascension.
          </div>
        </div>
      </Panel>
    </div>
  );
}