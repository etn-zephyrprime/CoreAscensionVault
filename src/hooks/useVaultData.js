import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { STAKING_ADDRESS } from "../config";
import stakingABI from "../abis/stakingABI.json";

const fallbackVault = {
  coreStaked: 0,
  earnedCore: 0,
  nftCount: 0,
  boost: 1.0,
  currentApr: 0,
  totalCoreStaked: 0,
  rewardsRemaining: 0,
  daysRemaining: 0,
  earlyExit: false,
  penaltyDaysRemaining: 0,
  userShare: 0,
  totalCoreBurned: 0,
  stakeHistory: [],
};

export function useVaultData(provider, account) {
  const [vaultData, setVaultData] = useState(fallbackVault);

  const loadVaultData = useCallback(async () => {
    try {
      if (!provider) return;

const staking = new ethers.Contract(
  STAKING_ADDRESS,
  stakingABI,
  provider
);

const totalCoreStaked = await staking.totalCoreStaked();
const rewardsRemaining = await staking.rewardsRemainingBySchedule();
const blocksRemaining = await staking.blocksRemaining();
const totalCoreBurned = await staking.totalCoreBurned();
const rewardPerBlock = await staking.rewardPerBlock();

const totalCoreStakedNum = Number(ethers.formatEther(totalCoreStaked));
const rewardPerBlockNum = Number(ethers.formatEther(rewardPerBlock));

const currentApr =
  totalCoreStakedNum > 0
    ? ((rewardPerBlockNum * 6_307_200) / totalCoreStakedNum) * 100
    : 0;

      let nextVaultData = {
        ...fallbackVault,
        totalCoreStaked: Number(ethers.formatEther(totalCoreStaked)),
        rewardsRemaining: Number(ethers.formatEther(rewardsRemaining)),
        daysRemaining: Math.floor((Number(blocksRemaining) * 5) / 86400),
        totalCoreBurned: Number(ethers.formatEther(totalCoreBurned)),
        currentApr: currentApr,
      };

      if (account) {
        const user = await staking.getUser(account);

const rewardWeight = Number(ethers.formatEther(user[2]));

const userCoreStaked = Number(ethers.formatEther(user[0]));

const userShare =
  totalCoreStakedNum > 0
    ? (userCoreStaked / totalCoreStakedNum) * 100
    : 0;

const entryTime = Number(user[3]);
const minStakeTime = 60 * 24 * 60 * 60; // 60 days
const now = Math.floor(Date.now() / 1000);

const penaltySecondsRemaining =
  entryTime > 0 ? Math.max(0, entryTime + minStakeTime - now) : 0;

const penaltyDaysRemaining = Math.ceil(
  penaltySecondsRemaining / 86400
);

nextVaultData = {
  ...nextVaultData,
  coreStaked: Number(ethers.formatEther(user[0])),
  nftCount: Number(user[1]),
  rewardWeight,
  entryTime: Number(user[3]),
  earnedCore: Number(ethers.formatEther(user[4])),
  earlyExit: Boolean(user[5]),
  boost: Number(user[6]) / 10000,
  userShare,
  penaltyDaysRemaining,
};
      }

// === Load Stake History (Recommended: from Backend) ===
      try {
        const historyRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/vault/stake-history`
        );
        
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          nextVaultData.stakeHistory = historyData.history || [];
        } else {
          // Fallback mock data for development
          nextVaultData.stakeHistory = [
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
        }
      } catch (historyErr) {
        console.warn("Could not load stake history from backend, using fallback");
        // Use fallback mock data
        nextVaultData.stakeHistory = [
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
      }

      setVaultData(nextVaultData);
    } catch (err) {
      console.error("loadVaultData failed:", err);
    }
  }, [provider, account]);

  useEffect(() => {
    loadVaultData();
  }, [loadVaultData]);

  return {
    vaultData,
    reloadVaultData: loadVaultData,
  };
}