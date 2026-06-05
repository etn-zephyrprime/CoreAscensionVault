import React from "react";
import { Shield, Lock, Flame, Timer } from "lucide-react";
import StatBox from "./StatBox.jsx";
import { orange, blue } from "../styles/theme.js";

function formatNumber(value, decimals = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return "Ready";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function VaultStats({ vaultData, isMobile }) {
  const data = vaultData || {};

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
        gap: 12,
        marginBottom: 12,
      }}
    >
      <StatBox
        isMobile={isMobile}
        icon={<Shield size={20} />}
        label="Current APY"
        value={`${formatNumber(data.currentApr, 2)}%`}
      />
      <StatBox
        isMobile={isMobile}
        icon={<Lock size={20} />}
        label="Total Staked"
        value={`${formatNumber(data.totalCoreStaked, 0)} CORE`}
      />
      <StatBox
        isMobile={isMobile}
        icon={<Flame size={20} />}
        label="Rewards Left"
        value={
          <>
            <div style={{ fontWeight: 600 }}>
              {formatNumber(data.rewardsRemaining, 0)} CORE
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#ffb37a",
                marginTop: 6,
                lineHeight: "1.35",
                opacity: 0.95,
              }}
            >
              Next drip in {formatTime(data.nextDripSeconds)}
            </div>
          </>
        }
        color={orange}
      />
      <StatBox
        isMobile={isMobile}
        icon={<Timer size={20} />}
        label="Term Left"
        value={`${Number(data.daysRemaining || 0)} Days`}
        color={blue}
      />
    </div>
  );
}