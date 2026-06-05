import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import Panel from "./Panel.jsx";
import NeonButton from "./NeonButton.jsx";
import {
  green,
  greenGlow,
  panel,
  panel2,
  muted,
} from "../styles/theme.js";

import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config.js";
import stakingABI from "../abis/stakingABI.json";
import { CORE_TOKEN } from "../config.js";
import ERC20ABI from "../abis/ERC20ABI.json";

function formatNumber(value, decimals = 2) {
  return Number(value || 0).toLocaleString(undefined, {
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

function miniSubStyle() {
  return {
    fontSize: 11,
    color: "#777",
    marginTop: 5,
  };
}

export default function VaultPosition({
  vaultData,
  wallet,
  isMobile,
  reloadVaultData,
}) {

  const [stakeAmount, setStakeAmount] = useState("10000");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showPenaltyInfo, setShowPenaltyInfo] = useState(true);

  const data = vaultData || {};

  const boostLabel = useMemo(() => `${(data.boost || 1).toFixed(2)}x`, [data.boost]);

  const hasPosition = Number(data.coreStaked || 0) > 0 || Number(data.nftCount || 0) > 0;
  const penaltyDaysRemaining = Number(data.penaltyDaysRemaining || 0);

  const earlyExitTitle = !hasPosition
    ? "No Position"
    : data.earlyExit ? "Active" : "Protected";

  const [coreAllowance, setCoreAllowance] = useState(0);
  const [coreBalance, setCoreBalance] = useState(0);
  const [txLoading, setTxLoading] = useState(false);

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

  const needsApproval = wallet.account && parsedStakeAmount > 0n && ethers.parseEther(String(coreAllowance || 0)) < parsedStakeAmount;

  async function loadCoreApprovalData() {
    try {
      if (!wallet.provider || !wallet.account) return;
      const core = new ethers.Contract(CORE_TOKEN, ERC20ABI, wallet.provider);
      const [allowance, balance] = await Promise.all([
        core.allowance(wallet.account, STAKING_ADDRESS),
        core.balanceOf(wallet.account),
      ]);
      setCoreAllowance(Number(ethers.formatEther(allowance)));
      setCoreBalance(Number(ethers.formatEther(balance)));
    } catch (err) {
      console.error("loadCoreApprovalData failed:", err);
    }
  }

  useEffect(() => {
    loadCoreApprovalData();
  }, [wallet.provider, wallet.account]);

  // ====================== ACTIONS ======================
  async function approveCore() {
    // ... (unchanged)
    try {
      setTxLoading(true);
      await wallet.ensureCorrectNetwork();
      const signer = await wallet.getSigner();
      const core = new ethers.Contract(CORE_TOKEN, ERC20ABI, signer);
      const tx = await core.approve(STAKING_ADDRESS, parsedStakeAmount);
      await tx.wait();
      await loadCoreApprovalData();
      alert("CORE approved.");
    } catch (err) {
      alert(err?.shortMessage || err?.reason || "Approve failed");
    } finally {
      setTxLoading(false);
    }
  }

  async function stakeCore() {
    // ... (unchanged)
    try {
      if (Number(vaultData?.nftCount || 0) <= 0) return alert("Stake at least 1 NFT first.");
      if (parsedStakeAmount <= 0n) return alert("Enter amount.");

      setTxLoading(true);
      await wallet.ensureCorrectNetwork();
      const signer = await wallet.getSigner();
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, signer);
      const tx = await staking.stakeCore(parsedStakeAmount);
      await tx.wait();

      await reloadVaultData();
      await loadCoreApprovalData();
      alert("CORE staked successfully!");
    } catch (err) {
      alert(err?.shortMessage || err?.reason || "Stake failed");
    } finally {
      setTxLoading(false);
    }
  }

  // ====================== SAFE PENALTY PREVIEW ======================
  async function previewEarlyPenalty(amountWei = 0n) {
    if (!wallet.provider || !wallet.account) return null;

    const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, wallet.provider);

    try {
      const [corePenalty, rewardSlash] = await Promise.allSettled([
        staking.pendingEarlyCorePenalty(wallet.account, amountWei),
        staking.pendingEarlyRewardSlash(wallet.account)
      ]);

      const cp = corePenalty.status === "fulfilled" ? corePenalty.value : null;
      const rs = rewardSlash.status === "fulfilled" ? rewardSlash.value : null;

      if (!cp && !rs) return null;

      return {
        returnedAmount: cp ? ethers.formatEther(cp[3]) : "0",
        penaltyToPool: cp ? ethers.formatEther(cp[1]) : "0",
        penaltyBurned: cp ? ethers.formatEther(cp[2]) : "0",
        rewardBeforeSlash: rs ? ethers.formatEther(rs[0]) : "0",
        slashAmount: rs ? ethers.formatEther(rs[1]) : "0",
        rewardAfterSlash: rs ? ethers.formatEther(rs[2]) : "0",
      };
    } catch (err) {
      console.warn("Preview failed silently:", err.message);
      return null;
    }
  }

  // ====================== ACTIONS ======================
  async function claimRewards() {
    try {
      if (Number(vaultData?.earnedCore || 0) <= 0) {
        return alert("No rewards available.");
      }

      let warning = "Claim CORE rewards?";

      if (data.earlyExit) {
        const preview = await previewEarlyPenalty(0n);
        if (preview && Number(preview.slashAmount) > 0) {
          warning = `⚠️ 50% REWARD PENALTY ACTIVE\n\n` +
            `Before: ${Number(preview.rewardBeforeSlash).toFixed(4)} CORE\n` +
            `Slash : ${Number(preview.slashAmount).toFixed(4)} CORE\n` +
            `You get: ${Number(preview.rewardAfterSlash).toFixed(4)} CORE\n\nContinue?`;
        }
      }

      if (!window.confirm(warning)) return;

      setTxLoading(true);
      await wallet.ensureCorrectNetwork();

      const signer = await wallet.getSigner();
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, signer);

      await (await staking.claim()).wait();

      await reloadVaultData();
      alert("✅ Rewards claimed successfully!");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.reason || "Claim failed");
    } finally {
      setTxLoading(false);
    }
  }

  async function withdrawCore() {
    try {
      if (parsedWithdrawAmount <= 0n) return alert("Enter amount to withdraw.");

      let warning = `Withdraw ${withdrawAmount} CORE?`;

      if (data.earlyExit) {
        const preview = await previewEarlyPenalty(parsedWithdrawAmount);
        if (preview && Number(preview.penaltyToPool) > 0) {
          warning = `⚠️ 15% EARLY WITHDRAWAL PENALTY\n\n` +
            `Requested : ${withdrawAmount} CORE\n` +
            `You receive: ${Number(preview.returnedAmount).toFixed(4)} CORE\n` +
            `To pool   : ${Number(preview.penaltyToPool).toFixed(4)} CORE\n\nContinue?`;
        }
      }

      if (!window.confirm(warning)) return;

      setTxLoading(true);
      await wallet.ensureCorrectNetwork();

      const signer = await wallet.getSigner();
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, signer);

      await (await staking.withdrawCore(parsedWithdrawAmount)).wait();

      await reloadVaultData();
      await loadCoreApprovalData();
      setWithdrawAmount("");
      alert("✅ CORE withdrawn successfully.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.reason || "Withdraw failed");
    } finally {
      setTxLoading(false);
    }
  }

  async function exitVault() {
    try {
      let warning = "Exit the vault completely?";

      if (data.earlyExit) {
        const fullAmount = ethers.parseEther(String(vaultData?.coreStaked || 0));
        const preview = await previewEarlyPenalty(fullAmount);
        if (preview) {
          warning = `⚠️ EARLY EXIT PENALTIES ACTIVE\n\n` +
            `CORE received : ${Number(preview.returnedAmount).toFixed(4)}\n` +
            `Rewards after slash : ${Number(preview.rewardAfterSlash).toFixed(4)}\n\nContinue?`;
        }
      }

      if (!window.confirm(warning)) return;

      setTxLoading(true);
      await wallet.ensureCorrectNetwork();

      const signer = await wallet.getSigner();
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, signer);

      await (await staking.exit()).wait();

      await reloadVaultData();
      await loadCoreApprovalData();
      alert("✅ Exited vault successfully.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.reason || "Exit failed");
    } finally {
      setTxLoading(false);
    }
  }
      
  const maxStakeable = Math.max(0, Math.min(Number(coreBalance || 0), 10000 - Number(vaultData?.coreStaked || 0)));

  return (
    <Panel style={{ background: panel2 }}>
      {/* Header + Mini Stats (kept the same) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: isMobile ? 20 : 24, color: green, margin: 0, textTransform: "uppercase", textShadow: `0 0 8px ${greenGlow}` }}>
          Your Vault Position
        </h2>
        <div style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid #6b4a00", background: "#1a1200", color: "#ffcc66", fontSize: 13, fontWeight: 900 }}>
          Boost {boostLabel}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>CORE Staked</div>
          <div style={miniValueStyle("#fff")}>{formatNumber(data.coreStaked, 2)}</div>
        </div>
        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>Earned CORE</div>
          <div style={miniValueStyle(green)}>{formatNumber(data.earnedCore, 4)}</div>
        </div>
        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>Pool Share</div>
          <div style={miniValueStyle("#ffcc66")}>{formatNumber(data.userShare, 2)}%</div>
        </div>
      </div>

      {/* Penalty Info */}
      <div style={{ border: "1px solid #6b4a00", borderRadius: 8, background: "#1a1200", marginBottom: 16, overflow: "hidden" }}>
        <div onClick={() => setShowPenaltyInfo(v => !v)} style={{ padding: "9px 10px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#ffcc66", fontWeight: 900 }}>
          <span><AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} /> Early Exit {earlyExitTitle}</span>
          <span>{showPenaltyInfo ? "▲" : "▼"}</span>
        </div>
        {showPenaltyInfo && (
          <div style={{ padding: "8px 10px", fontSize: 12, color: "#ffcc66" }}>
            {data.earlyExit 
              ? `${penaltyDaysRemaining} day(s) left in 60-day penalty window.` 
              : "No early exit penalty active."}
          </div>
        )}
      </div>

      {/* Sliders with presets (restored) */}
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
        <NeonButton variant="blue" onClick={needsApproval ? approveCore : stakeCore} disabled={txLoading || !wallet.account || parsedStakeAmount <= 0n || Number(vaultData?.nftCount || 0) <= 0} style={{ flex: 1 }}>
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