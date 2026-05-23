import React from "react";
import Panel from "./Panel.jsx";
import { green, greenGlow } from "../styles/theme.js";

function InfoRow({
  label,
  value,
  highlight = false,
}) {
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
      <span style={{ color: "#888" }}>
        {label}
      </span>

      <span
        style={{
          color: highlight
            ? "#ffcc66"
            : "#fff",
          fontWeight: 800,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatNumber(
  value,
  decimals = 2
) {
  return Number(
    value || 0
  ).toLocaleString(undefined, {
    minimumFractionDigits:
      decimals,
    maximumFractionDigits:
      decimals,
  });
}

export default function VaultIntelligence({
  isMobile,
  vaultData,
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <Panel>
        <h2
          style={{
            color: green,
            fontWeight: 900,
            fontSize: isMobile
              ? 20
              : 26,
            textTransform:
              "uppercase",
            textShadow: `0 0 8px ${greenGlow}`,
            margin:
              "0 0 12px 0",
          }}
        >
          Vault Intelligence
        </h2>

        {/* Top row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              isMobile
                ? "1fr"
                : "repeat(4, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <InfoRow
            label="Reward Schedule"
            value="Block Based"
          />

          <InfoRow
            label="Penalty Window"
            value="60 Days"
          />

          <InfoRow
            label="Max Stake"
            value="10,000 CORE"
          />

          <InfoRow
            label="Max NFT Boost"
            value="1.30x"
            highlight
          />
        </div>

{/* CORE Burn row */}
<div
  style={{
    background: "#0f0f0f",
    border: "1px solid #333",
    borderRadius: 14,
    padding: "18px 20px",
    boxShadow:
      "0 0 10px rgba(0,0,0,0.35)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    marginTop: 10,
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
      fontSize: isMobile
        ? 26
        : 30,
      fontWeight: 900,
      color: "#ff8a3d",
      textShadow:
        "0 0 14px rgba(255,138,61,0.35)",
      marginBottom: 8,
      lineHeight: 1,
    }}
  >
    🔥{" "}
    {formatNumber(
      vaultData?.totalCoreBurned,
      2
    )}{" "}
    CORE 🔥
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
    CORE permanently removed
    through early withdrawal
    penalties in CORE Ascension.
  </div>
</div>
      </Panel>
    </div>
  );
}