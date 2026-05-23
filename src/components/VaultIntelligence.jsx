import React from "react";
import Panel from "./Panel.jsx";
import { green, greenGlow } from "../styles/theme.js";

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

export default function VaultIntelligence({ isMobile }) {
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
            margin: "0 0 12px 0",
          }}
        >
          Vault Intelligence
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(4, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <InfoRow label="Reward Schedule" value="Block Based" />
          <InfoRow label="Penalty Window" value="60 Days" />
          <InfoRow label="Max Stake" value="10,000 CORE" />
          <InfoRow label="Max NFT Boost" value="1.30x" highlight />
        </div>
      </Panel>
    </div>
  );
}