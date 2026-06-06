import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import Panel from "./Panel.jsx";
import NeonButton from "./NeonButton.jsx";
import { green, greenGlow, panel, panel2, muted } from "../styles/theme.js";

import { ethers } from "ethers";
import { STAKING_ADDRESS, CORE_TOKEN } from "../config.js";
import stakingABI from "../abis/stakingABI.json";
import ERC20ABI from "../abis/ERC20ABI.json";

function formatNumber(value, decimals = 2) {
  const num = Number(value || 0);
  return isNaN(num) ? "0" : num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function miniMetricStyle() {
  return {
    background: panel,
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    padding: 12,
    boxShadow: "0 0 8px rgba(0,0,0,0.25)",
  };
}

function miniLabelStyle() {
  return {
    fontSize: 11,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 6,
  };
}

function miniValueStyle(color) {
  return {
    fontSize: 24,
    fontWeight: 900,
    color,
    lineHeight: 1.1,
  };
}

export default function VaultPosition({
  vaultData,
  wallet,
  isMobile,
  reloadVaultData,
}) {
  const [stakeAmount, setStakeAmount] = useState("0");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showPenaltyInfo, setShowPenaltyInfo] = useState(true);
  const [penaltyPreview, setPenaltyPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const data = vaultData || {};

  const coreStaked = Number(data.coreStaked || 0);
  const nftCount = Number(data.nftCount || 0);
  const earnedCore = Number(data.earnedCore || 0);
  const userShare = Number(data.userShare || 0);
  const boost = Number(data.boost || 1);

  const hasPosition = coreStaked > 0 || nftCount > 0;

  const boostLabel = useMemo(() => `${boost.toFixed(2)}x`, [boost]);

  const maxStakeable = Math.max(0, Math.min(Number(data.coreBalance || 0), 10000 - coreStaked));

  // ====================== PENALTY PREVIEW ======================
  async function previewEarlyPenalty(amountWei = 0n) {
    if (!wallet?.provider || !wallet?.account) return null;
    setLoadingPreview(true);

    try {
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, wallet.provider);
      const user = await staking.getUser(wallet.account);

      // Use local preview logic (more reliable)
      const result = previewPenaltyFromContract({
        amountWei,
        earnedWei: user.pendingRewards,
        isEarly: user.currentlyEarly,
      });

      return {
        returnedAmount: ethers.formatEther(result.returnedAmount),
        penaltyToPool: ethers.formatEther(result.penaltyToPool),
        penaltyBurned: ethers.formatEther(result.penaltyBurned),
        slashAmount: ethers.formatEther(result.slashAmount),
        rewardAfterSlash: ethers.formatEther(result.rewardAfterSlash),
      };
    } catch (err) {
      console.error("Penalty preview failed:", err);
      return null;
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    if (!data.earlyExit || !wallet?.account || coreStaked <= 0) {
      setPenaltyPreview(null);
      return;
    }

    const amountWei = ethers.parseEther(coreStaked.toString());
    previewEarlyPenalty(amountWei).then(setPenaltyPreview);
  }, [data.earlyExit, coreStaked, wallet?.account]);

  // ====================== APPROVAL & BALANCE ======================
  const [coreAllowance, setCoreAllowance] = useState(0n);
  const [coreBalance, setCoreBalance] = useState(0);

  async function loadCoreApprovalData() {
    if (!wallet?.provider || !wallet?.account) return;
    try {
      const core = new ethers.Contract(CORE_TOKEN, ERC20ABI, wallet.provider);
      const [allowance, balance] = await Promise.all([
        core.allowance(wallet.account, STAKING_ADDRESS),
        core.balanceOf(wallet.account),
      ]);
      setCoreAllowance(allowance);
      setCoreBalance(Number(ethers.formatEther(balance)));
    } catch (err) {
      console.error("loadCoreApprovalData failed:", err);
    }
  }

  useEffect(() => {
    loadCoreApprovalData();
  }, [wallet?.provider, wallet?.account]);

  const parsedStakeAmount = useMemo(() => {
    try {
      return stakeAmount && Number(stakeAmount) > 0 ? ethers.parseEther(stakeAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [stakeAmount]);

  const parsedWithdrawAmount = useMemo(() => {
    try {
      return withdrawAmount && Number(withdrawAmount) > 0 ? ethers.parseEther(withdrawAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [withdrawAmount]);

  const needsApproval = wallet?.account && parsedStakeAmount > 0n && coreAllowance < parsedStakeAmount;

  // ====================== LOCAL PENALTY CALCULATION ======================
  function previewPenaltyFromContract({ amountWei, earnedWei, isEarly }) {
    if (!isEarly) {
      return { returnedAmount: amountWei, penaltyToPool: 0n, penaltyBurned: 0n, slashAmount: 0n, rewardAfterSlash: earnedWei };
    }

    const stakePenalty = (amountWei * 1500n) / 10000n;
    const returnedAmount = amountWei - stakePenalty;
    const penaltyToPool = (stakePenalty * 2n) / 3n;
    const penaltyBurned = stakePenalty - penaltyToPool;

    const slashAmount = (earnedWei * 5000n) / 10000n;
    const rewardAfterSlash = earnedWei - slashAmount;

    return { returnedAmount, penaltyToPool, penaltyBurned, slashAmount, rewardAfterSlash };
  }

  // ====================== RENDER ======================
  return (
    <Panel style={{ background: panel2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: isMobile ? 20 : 24, color: green, margin: 0, textTransform: "uppercase", textShadow: `0 0 8px ${greenGlow}` }}>
          Your Vault Position
        </h2>
        <div style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid #6b4a00", background: "#1a1200", color: "#ffcc66", fontSize: 13, fontWeight: 900 }}>
          Boost {boostLabel}
        </div>
      </div>

      {/* Mini Stats */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>CORE Staked</div>
          <div style={miniValueStyle("#fff")}>{formatNumber(coreStaked, 2)}</div>
        </div>
        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>Earned CORE</div>
          <div style={miniValueStyle(green)}>{formatNumber(earnedCore, 4)}</div>
        </div>
        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>Pool Share</div>
          <div style={miniValueStyle("#ffcc66")}>{formatNumber(userShare, 2)}%</div>
        </div>
      </div>

      {/* Penalty Info */}
      <div style={{ border: "1px solid #6b4a00", borderRadius: 8, background: "#1a1200", marginBottom: 16, overflow: "hidden" }}>
        <div onClick={() => setShowPenaltyInfo(v => !v)} style={{ padding: "9px 10px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#ffcc66", fontWeight: 900 }}>
          <span><AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} /> Early Exit {hasPosition ? (data.earlyExit ? "Active" : "Protected") : "No Position"}</span>
          <span>{showPenaltyInfo ? "▲" : "▼"}</span>
        </div>

        {showPenaltyInfo && (
          <div style={{ padding: "8px 10px", fontSize: 12, color: "#ffcc66" }}>
            {data.earlyExit && hasPosition ? (
              <>
                <div>{Number(data.penaltyDaysRemaining || 0)} day(s) left in 60-day penalty window.</div>
                {penaltyPreview && (
                  <div style={{ marginTop: 10, padding: 10, background: "#110800", borderRadius: 8, border: "1px solid #8a5a00" }}>
                    <div>CORE penalty: {Number(penaltyPreview.penaltyToPool).toFixed(4)}</div>
                    <div>Reward slash: {Number(penaltyPreview.slashAmount).toFixed(4)}</div>
                    <div>Rewards received: {Number(penaltyPreview.rewardAfterSlash).toFixed(4)}</div>
                  </div>
                )}
              </>
            ) : (
              "No early exit penalty active."
            )}
          </div>
        )}
      </div>

      {/* Sliders + Presets (unchanged) */}
      {/* Stake Section */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: "#aaa", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Stake CORE</label>
        <input type="range" min="0" max="100" step="1" value={maxStakeable > 0 ? Math.round((Number(stakeAmount || 0) / maxStakeable) * 100) : 0} onChange={(e) => setStakeAmount(((maxStakeable * Number(e.target.value)) / 100).toFixed(4))} style={{ width: "100%", accentColor: "#18bb1a" }} />
        <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
          {[25,50,75,100].map(p => <button key={p} onClick={() => setStakeAmount(((maxStakeable * p) / 100).toFixed(4))} style={{ flex: 1, padding: "6px", fontSize: 12, background: "#222", border: "1px solid #444", borderRadius: 8 }}>{p}%</button>)}
        </div>
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: 12, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#18bb1a" }}>{Number(stakeAmount || 0).toLocaleString()} CORE</div>
        </div>
      </div>

      {/* Withdraw Section */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: "#aaa", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Withdraw CORE</label>
        <input type="range" min="0" max="100" step="1" value={Number(vaultData?.coreStaked || 0) > 0 ? Math.round((Number(withdrawAmount || 0) / Number(vaultData.coreStaked)) * 100) : 0} onChange={(e) => setWithdrawAmount(((Number(vaultData?.coreStaked || 0) * Number(e.target.value)) / 100).toFixed(4))} style={{ width: "100%", accentColor: "#ff4d4d" }} />
        <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
          {[25,50,75,100].map(p => <button key={p} onClick={() => setWithdrawAmount(((Number(vaultData?.coreStaked || 0) * p) / 100).toFixed(4))} style={{ flex: 1, padding: "6px", fontSize: 12, background: "#222", border: "1px solid #444", borderRadius: 8 }}>{p}%</button>)}
        </div>
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: 12, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#ff4d4d" }}>{Number(withdrawAmount || 0).toLocaleString()} CORE</div>
        </div>
      </div>

{/* Buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 8 : 12 }}>
        <NeonButton variant="blue" onClick={needsApproval ? approveCore : stakeCore} disabled={txLoading || !wallet.account || parsedStakeAmount <= 0n || nftCount <= 0} style={{ flex: 1 }}>
          {txLoading ? "Processing..." : needsApproval ? "Approve CORE" : "Stake CORE"}
        </NeonButton>
        
        <NeonButton variant="green" onClick={claimRewards} disabled={!wallet.account || Number(vaultData?.earnedCore || 0) <= 0} style={{ flex: 1 }}>
          Claim Rewards
        </NeonButton>

        <NeonButton variant="dark" onClick={withdrawCore} disabled={txLoading || !wallet.account || parsedWithdrawAmount <= 0n || Number(vaultData?.coreStaked || 0) <= 0} style={{ flex: 1 }}>
          Withdraw CORE
        </NeonButton>

        <NeonButton variant="danger" onClick={exitVault} disabled={txLoading || !wallet.account || (Number(vaultData?.coreStaked || 0) <= 0 && Number(vaultData?.nftCount || 0) <= 0)} style={{ flex: 1 }}>
          Exit Vault
        </NeonButton>
      </div>
    </Panel>
  );
}