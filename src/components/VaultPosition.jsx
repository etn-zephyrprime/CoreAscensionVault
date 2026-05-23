import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import Panel from "./Panel.jsx";
import NeonButton from "./NeonButton.jsx";
import {
  green,
  greenGlow,
  panel,
  panel2,
  border,
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

  const boostLabel = useMemo(
    () => `${(data.boost || 1).toFixed(2)}x`,
    [data.boost]
  );

const hasPosition =
  Number(data.coreStaked || 0) > 0 || Number(data.nftCount || 0) > 0;

const penaltyDaysRemaining = Number(data.penaltyDaysRemaining || 0);

const earlyExitTitle = !hasPosition
  ? "No Position"
  : data.earlyExit
  ? "Active"
  : "Protected";

const [coreAllowance, setCoreAllowance] = useState(0);
const [coreBalance, setCoreBalance] = useState(0);
const [txLoading, setTxLoading] = useState(false);

const parsedStakeAmount = useMemo(() => {
  try {
    if (!stakeAmount || Number(stakeAmount) <= 0) return 0n;
    return ethers.parseEther(stakeAmount);
  } catch {
    return 0n;
  }
}, [stakeAmount]);

const parsedWithdrawAmount = useMemo(() => {
  try {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return 0n;
    return ethers.parseEther(withdrawAmount);
  } catch {
    return 0n;
  }
}, [withdrawAmount]);

const needsApproval =
  wallet.account &&
  parsedStakeAmount > 0n &&
  ethers.parseEther(String(coreAllowance || 0)) < parsedStakeAmount;

async function loadCoreApprovalData() {
  try {
    if (!wallet.provider || !wallet.account) return;

    const core = new ethers.Contract(
      CORE_TOKEN,
      ERC20ABI,
      wallet.provider
    );

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
}, [wallet.provider, wallet.account, stakeAmount]);

async function approveCore() {
  try {
    if (!wallet.account) {
      alert("Connect wallet first");
      return;
    }

    if (parsedStakeAmount <= 0n) {
      alert("Enter a valid CORE amount.");
      return;
    }

    setTxLoading(true);
    await wallet.ensureCorrectNetwork();

    const signer = await wallet.getSigner();

    const core = new ethers.Contract(
      CORE_TOKEN,
      ERC20ABI,
      signer
    );

    const tx = await core.approve(
      STAKING_ADDRESS,
      parsedStakeAmount
    );

    await tx.wait();

    await loadCoreApprovalData();

    alert("CORE approved.");
  } catch (err) {
    console.error("Approve failed:", err);
    alert(err?.shortMessage || err?.reason || "Approve failed");
  } finally {
    setTxLoading(false);
  }
}

async function stakeCore() {
  try {
    if (!wallet.account) {
      alert("Connect wallet first");
      return;
    }

    if (Number(vaultData?.nftCount || 0) <= 0) {
      alert("Stake at least 1 eligible NFT before staking CORE.");
      return;
    }

    if (parsedStakeAmount <= 0n) {
      alert("Enter a valid CORE amount.");
      return;
    }

    if (Number(stakeAmount) > Number(coreBalance || 0)) {
      alert("Insufficient CORE balance.");
      return;
    }

    setTxLoading(true);
    await wallet.ensureCorrectNetwork();

    const signer = await wallet.getSigner();

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      stakingABI,
      signer
    );

    const tx = await staking.stakeCore(parsedStakeAmount);
    await tx.wait();

    await reloadVaultData();
    await loadCoreApprovalData();

    alert("CORE staked successfully.");
  } catch (err) {
    console.error("Stake CORE failed:", err);
    alert(err?.shortMessage || err?.reason || "Stake CORE failed");
  } finally {
    setTxLoading(false);
  }
}

async function claimRewards() {
  try {
    if (!wallet.account) {
      alert("Connect wallet first");
      return;
    }

    if (!vaultData?.coreStaked || Number(vaultData.coreStaked) <= 0) {
      alert("You need a staking position before claiming rewards.");
      return;
    }

    if (!vaultData?.earnedCore || Number(vaultData.earnedCore) <= 0) {
      alert("You do not have any claimable CORE rewards yet.");
      return;
    }

    let warning = "Claim CORE rewards from the vault?";

    if (data.earlyExit) {
      const preview = await previewEarlyPenalty(0n);
      if (!preview) return;

      warning =
        `You are still inside the 60 day penalty window.\n\n` +
        `Reward before slash: ${Number(preview.rewardBeforeSlash).toFixed(6)} CORE\n` +
        `Reward slash: ${Number(preview.slashAmount).toFixed(6)} CORE\n` +
        `Reward after slash: ${Number(preview.rewardAfterSlash).toFixed(6)} CORE\n\n` +
        `Continue?`;
    }

    const confirmed = window.confirm(warning);
    if (!confirmed) return;

    setTxLoading(true);
    await wallet.ensureCorrectNetwork();

    const signer = await wallet.getSigner();

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      stakingABI,
      signer
    );

    const tx = await staking.claim();
    await tx.wait();

    await reloadVaultData();

    alert("Rewards claimed successfully.");
  } catch (err) {
    console.error("Claim failed:", err);

    const message =
      err?.reason ||
      err?.shortMessage ||
      err?.message ||
      "Claim failed";

    alert(message);
  } finally {
    setTxLoading(false);
  }
}

async function withdrawCore() {
  try {
    if (!wallet.account) {
      alert("Connect wallet first");
      return;
    }

    if (parsedWithdrawAmount <= 0n) {
      alert("Enter a valid CORE amount to withdraw.");
      return;
    }

    if (Number(vaultData?.coreStaked || 0) <= 0) {
      alert("You do not have any CORE staked.");
      return;
    }

    if (Number(withdrawAmount) > Number(vaultData?.coreStaked || 0)) {
      alert("You cannot withdraw more CORE than you have staked.");
      return;
    }

    let warning = "Withdraw CORE from the vault?";

    if (data.earlyExit) {
      const preview = await previewEarlyPenalty(parsedWithdrawAmount);
      if (!preview) return;

      warning =
        `You are still inside the 60 day penalty window.\n\n` +
        `Requested withdraw: ${withdrawAmount} CORE\n` +
        `Returned CORE: ${Number(preview.returnedAmount).toFixed(6)} CORE\n` +
        `Penalty to pool: ${Number(preview.penaltyToPool).toFixed(6)} CORE\n` +
        `Penalty burned: ${Number(preview.penaltyBurned).toFixed(6)} CORE\n\n` +
        `Reward before slash: ${Number(preview.rewardBeforeSlash).toFixed(6)} CORE\n` +
        `Reward slash: ${Number(preview.slashAmount).toFixed(6)} CORE\n` +
        `Reward after slash: ${Number(preview.rewardAfterSlash).toFixed(6)} CORE\n\n` +
        `Continue?`;
    }

    const confirmed = window.confirm(warning);
    if (!confirmed) return;

    setTxLoading(true);
    await wallet.ensureCorrectNetwork();

    const signer = await wallet.getSigner();

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      stakingABI,
      signer
    );

    const tx = await staking.withdrawCore(parsedWithdrawAmount);
    await tx.wait();

    await reloadVaultData();
    await loadCoreApprovalData();

    setWithdrawAmount("");

    alert("CORE withdrawn successfully.");
  } catch (err) {
    console.error("Withdraw CORE failed:", err);
    alert(err?.shortMessage || err?.reason || "Withdraw CORE failed");
  } finally {
    setTxLoading(false);
  }
}

async function exitVault() {
  try {
    if (!wallet.account) {
      alert("Connect wallet first");
      return;
    }

    const hasCore = Number(vaultData?.coreStaked || 0) > 0;
    const hasNfts = Number(vaultData?.nftCount || 0) > 0;

    if (!hasCore && !hasNfts) {
      alert("You do not have a vault position to exit.");
      return;
    }

let warning =
  "Exit the vault? This will withdraw your staked CORE, claim available rewards, and return all staked NFTs.";

if (data.earlyExit) {
  const fullStakeWei = ethers.parseEther(String(vaultData?.coreStaked || 0));
  const preview = await previewEarlyPenalty(fullStakeWei);

  if (!preview) return;

  warning =
    `You are still inside the 60 day penalty window.\n\n` +
    `CORE staked: ${Number(vaultData?.coreStaked || 0).toFixed(6)} CORE\n` +
    `Returned CORE: ${Number(preview.returnedAmount).toFixed(6)} CORE\n` +
    `Penalty to pool: ${Number(preview.penaltyToPool).toFixed(6)} CORE\n` +
    `Penalty burned: ${Number(preview.penaltyBurned).toFixed(6)} CORE\n\n` +
    `Reward before slash: ${Number(preview.rewardBeforeSlash).toFixed(6)} CORE\n` +
    `Reward slash: ${Number(preview.slashAmount).toFixed(6)} CORE\n` +
    `Reward after slash: ${Number(preview.rewardAfterSlash).toFixed(6)} CORE\n\n` +
    `Staked NFTs returned: ${Number(vaultData?.nftCount || 0)}\n\n` +
    `Continue?`;
}

const confirmed = window.confirm(warning);
if (!confirmed) return;

    setTxLoading(true);
    await wallet.ensureCorrectNetwork();

    const signer = await wallet.getSigner();

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      stakingABI,
      signer
    );

    const tx = await staking.exit();
    await tx.wait();

    await reloadVaultData();
    await loadCoreApprovalData();

    alert("Exited vault successfully.");
  } catch (err) {
    console.error("Exit vault failed:", err);
    alert(err?.shortMessage || err?.reason || "Exit vault failed");
  } finally {
    setTxLoading(false);
  }
}

async function previewEarlyPenalty(amountWei) {
  if (!wallet.provider || !wallet.account) return null;

  const staking = new ethers.Contract(
    STAKING_ADDRESS,
    stakingABI,
    wallet.provider
  );

  const [corePenalty, rewardSlash] = await Promise.all([
    staking.pendingEarlyCorePenalty(wallet.account, amountWei),
    staking.pendingEarlyRewardSlash(wallet.account),
  ]);

  return {
    totalPenalty: ethers.formatEther(corePenalty[0]),
    penaltyToPool: ethers.formatEther(corePenalty[1]),
    penaltyBurned: ethers.formatEther(corePenalty[2]),
    returnedAmount: ethers.formatEther(corePenalty[3]),
    rewardBeforeSlash: ethers.formatEther(rewardSlash[0]),
    slashAmount: ethers.formatEther(rewardSlash[1]),
    rewardAfterSlash: ethers.formatEther(rewardSlash[2]),
  };
}

  return (
    <Panel style={{ background: panel2 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <h2
          style={{
            fontSize: isMobile ? 20 : 24,
            color: green,
            margin: 0,
            textTransform: "uppercase",
            textShadow: `0 0 8px ${greenGlow}`,
          }}
        >
          Your Vault Position
        </h2>

        <div
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid #6b4a00",
            background: "#1a1200",
            color: "#ffcc66",
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          Boost {boostLabel}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(3, minmax(0, 1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>CORE Staked</div>
          <div style={miniValueStyle("#fff")}>
            {formatNumber(data.coreStaked, 2)}
          </div>
          <div style={miniSubStyle()}>Max 10,000 CORE</div>
        </div>

        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>Earned CORE</div>
          <div style={miniValueStyle(green)}>
            {formatNumber(data.earnedCore, 4)}
          </div>
          <div style={miniSubStyle()}>Claimable rewards</div>
        </div>

        <div style={miniMetricStyle()}>
          <div style={miniLabelStyle()}>Pool Share</div>
          <div style={miniValueStyle("#ffcc66")}>
            {formatNumber(data.userShare, 2)}%
          </div>
          <div style={miniSubStyle()}>Boost-adjusted</div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #6b4a00",
          borderRadius: 8,
          background: "#1a1200",
          marginBottom: 12,
          overflow: "hidden",
        }}
      >
        <div
          onClick={() => setShowPenaltyInfo((v) => !v)}
          style={{
            padding: "9px 10px",
            fontSize: isMobile ? 12 : 13,
            color: "#ffcc66",
            fontWeight: 900,
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            <AlertTriangle
              size={14}
              style={{
                verticalAlign: "-2px",
                marginRight: 6,
              }}
            />
            Early Exit {earlyExitTitle}
          </span>

          <span style={{ opacity: 0.7 }}>
            {showPenaltyInfo ? "▲" : "▼"}
          </span>
        </div>

        {showPenaltyInfo && (
          <div
            style={{
              padding: "8px 10px",
              fontSize: isMobile ? 11 : 12,
              color: "#ffcc66",
              lineHeight: 1.45,
              borderTop: "1px solid #6b4a00",
            }}
          >
{!hasPosition ? (
  <>
    Stake CORE and eligible NFTs to start a vault position. The early exit
    window begins when you enter the vault.
  </>
) : data.earlyExit ? (
  <>
    {penaltyDaysRemaining} day{penaltyDaysRemaining === 1 ? "" : "s"} remaining.
    Claiming, withdrawing, or exiting during this window may apply a{" "}
    <strong>15% CORE penalty</strong> and a{" "}
    <strong>50% reward slash</strong>. The exact amounts are shown before
    each transaction.
  </>
) : (
  <>
    Your position has passed the penalty window. Withdrawing or exiting now
    returns your available CORE and rewards without early-exit penalties.
  </>
)}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          marginBottom: 12,
        }}
      >
        <label
          style={{
            fontSize: 12,
            color: "#aaa",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Stake CORE
        </label>

        <input
          value={stakeAmount}
          onChange={(e) => setStakeAmount(e.target.value)}
          type="number"
          placeholder="Enter amount"
          style={{
            width: "100%",
            maxWidth: isMobile ? "100%" : 260,
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${border}`,
            background: panel,
            color: "#fff",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 12,
  }}
>
  <label
    style={{
      fontSize: 12,
      color: "#aaa",
      fontWeight: 700,
      textTransform: "uppercase",
    }}
  >
    Withdraw Amount
  </label>

  <input
    value={withdrawAmount}
    onChange={(e) => setWithdrawAmount(e.target.value)}
    type="number"
    placeholder="Enter withdraw amount"
    style={{
      width: "100%",
      maxWidth: isMobile ? "100%" : 260,
      padding: "10px 12px",
      borderRadius: 8,
      border: `1px solid ${border}`,
      background: panel,
      color: "#fff",
      fontSize: 14,
      outline: "none",
      boxSizing: "border-box",
    }}
  />
</div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: isMobile ? 8 : 12,
          justifyContent: isMobile ? "center" : "flex-start",
        }}
      >
<NeonButton
  variant="blue"
  onClick={needsApproval ? approveCore : stakeCore}
  disabled={
    txLoading ||
    !wallet.account ||
    parsedStakeAmount <= 0n ||
    Number(vaultData?.nftCount || 0) <= 0
  }
  style={{
    flex: isMobile ? "1 1 100%" : "1 1 auto",
  }}
>
  {txLoading
    ? "Processing..."
    : needsApproval
    ? "Approve CORE"
    : "Stake CORE"}
</NeonButton>

<NeonButton
  variant="green"
  onClick={claimRewards}
  disabled={
    !wallet.account ||
    Number(vaultData?.coreStaked || 0) <= 0 ||
    Number(vaultData?.earnedCore || 0) <= 0
  }
  style={{
    flex: isMobile ? "1 1 100%" : "1 1 auto",
  }}
>
  Claim Rewards
</NeonButton>

<NeonButton
  variant="dark"
  onClick={withdrawCore}
disabled={
  txLoading ||
  !wallet.account ||
  parsedWithdrawAmount <= 0n ||
  Number(vaultData?.coreStaked || 0) <= 0
}
  style={{
    flex: isMobile ? "1 1 100%" : "1 1 auto",
  }}
>
  {txLoading ? "Processing..." : "Withdraw CORE"}
</NeonButton>

<NeonButton
  variant="danger"
  onClick={exitVault}
  disabled={
    txLoading ||
    !wallet.account ||
    (
      Number(vaultData?.coreStaked || 0) <= 0 &&
      Number(vaultData?.nftCount || 0) <= 0
    )
  }
  style={{
    flex: isMobile ? "1 1 100%" : "1 1 auto",
  }}
>
  {txLoading ? "Processing..." : "Exit Vault"}
</NeonButton>
      </div>
    </Panel>
  );
}