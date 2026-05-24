import React from "react";
import { Shield, Lock, Flame, Timer } from "lucide-react";
import StatBox from "./StatBox.jsx";
import { orange, blue } from "../styles/theme.js";

function formatNumber(value, decimals = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });
}

export default function VaultStats({ vaultData, isMobile }) {
  const data = vaultData || {};

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile
  ? "1fr"
  : "repeat(4, minmax(0, 1fr))",
        gap: 12,
        marginBottom: 12,
      }}
    >
<StatBox
  isMobile={isMobile}
  icon={<Shield size={20} />}
  label="Current APR"
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
  value={`${formatNumber(data.rewardsRemaining, 0)} CORE`}
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