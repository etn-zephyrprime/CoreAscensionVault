import React, { useEffect, useState, useMemo } from "react";
import { ethers } from "ethers";

import Panel from "./Panel.jsx";
import NeonButton from "./NeonButton.jsx";
import { green, panel2 } from "../styles/theme.js";

import { STAKING_ADDRESS, BACKEND_URL } from "../config.js";
import stakingABI from "../abis/stakingABI.json";
import EVGABI from "../abis/EVGABI.json";

import { useOwnedNfts } from "../hooks/useOwnedNfts.js";
import { getNftImageSrc } from "../utils/nftImages.js";

export default function NftHangar({
  vaultData,
  wallet,
  isMobile,
  reloadVaultData,
}) {
  const [showNftGallery, setShowNftGallery] = useState(true);
  const [selectedNft, setSelectedNft] = useState(null);
  const [txLoading, setTxLoading] = useState(false);

  const {
    ownedNFTs,
    mapping,
    loading,
    message,
    reloadOwnedNfts,
    refreshOwnedNfts,
  } = useOwnedNfts(wallet.account);

  const [stakedNfts, setStakedNfts] = useState([]);
  const [selectedStakedNft, setSelectedStakedNft] = useState(null);

  const getNftName = (nft) => {
    if (!mapping || !nft?.nftAddress || !nft?.tokenId) return null;
    const collectionKey = nft.nftAddress.toLowerCase();
    return mapping[collectionKey]?.[nft.tokenId]?.name || null;
  };

  const stakedNames = useMemo(() => {
    const names = new Set();
    stakedNfts.forEach((nft) => {
      const name = getNftName(nft);
      if (name) names.add(name);
    });
    return names;
  }, [stakedNfts, mapping]);

  async function loadStakedNfts() {
    try {
      if (!wallet.provider || !wallet.account) {
        setStakedNfts([]);
        return;
      }

      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, wallet.provider);

      let list = [];
      try {
        // Try the new function name
        list = await staking.getUserNFTs(wallet.account);
      } catch (err) {
        console.warn("getUserNFTs failed, trying fallback...");
        // Fallback in case function name differs
        try {
          const user = await staking.getUser(wallet.account);
          // If getUser returns NFTs (unlikely), but just in case
          console.warn("getUser fallback used");
        } catch (e2) {
          console.error("Could not load staked NFTs:", err);
        }
      }

      const enriched = list.map((item) => ({
        nftAddress: item.collection,
        tokenId: item.tokenId.toString(),
        name: getNftName({
          nftAddress: item.collection,
          tokenId: item.tokenId.toString(),
        }),
      }));

      setStakedNfts(enriched);
    } catch (err) {
      console.error("loadStakedNfts failed:", err);
      setStakedNfts([]);
    }
  }

  // Stake function remains mostly the same
  async function stakeSelectedNft() {
    if (!selectedNft) {
      alert("Please select an NFT first");
      return;
    }

    const nftName = getNftName(selectedNft);

    if (nftName && stakedNames.has(nftName)) {
      alert(`You already have a "${nftName}" staked.\n\nOnly one NFT per unique name is allowed.`);
      return;
    }

    try {
      setTxLoading(true);
      await wallet.ensureCorrectNetwork();

      const signer = await wallet.getSigner();
      const nftContract = new ethers.Contract(selectedNft.nftAddress, EVGABI, signer);
      const stakingContract = new ethers.Contract(STAKING_ADDRESS, stakingABI, signer);

      const tokenId = BigInt(selectedNft.tokenId);

      const approved = await nftContract.getApproved(tokenId);
      const approvedForAll = await nftContract.isApprovedForAll(wallet.account, STAKING_ADDRESS);

      if (approved.toLowerCase() !== STAKING_ADDRESS.toLowerCase() && !approvedForAll) {
        const approveTx = await nftContract.approve(STAKING_ADDRESS, tokenId);
        await approveTx.wait();
      }

      const stakeTx = await stakingContract.stakeNFT(selectedNft.nftAddress, tokenId);
      await stakeTx.wait();

      await reloadVaultData?.();
      await reloadOwnedNfts();
      await loadStakedNfts();

      setSelectedNft(null);
      alert("NFT staked successfully!");
    } catch (err) {
      console.error("Stake NFT failed:", err);
      alert(err?.shortMessage || err?.reason || "Failed to stake NFT");
    } finally {
      setTxLoading(false);
    }
  }

  async function withdrawSelectedNft() {
    if (!selectedStakedNft) {
      alert("Select a staked NFT first");
      return;
    }

    if (
      Number(vaultData?.coreStaked || 0) > 0 &&
      Number(vaultData?.nftCount || 0) <= 1
    ) {
      alert("You must keep at least 1 NFT staked while you have CORE staked.");
      return;
    }

    const confirmed = window.confirm("Withdraw this NFT?");
    if (!confirmed) return;

    try {
      setTxLoading(true);
      await wallet.ensureCorrectNetwork();

      const signer = await wallet.getSigner();
      const staking = new ethers.Contract(STAKING_ADDRESS, stakingABI, signer);

      const tx = await staking.withdrawNFT(
        selectedStakedNft.nftAddress,
        BigInt(selectedStakedNft.tokenId)
      );

      await tx.wait();

      await reloadVaultData?.();
      await loadStakedNfts();
      await reloadOwnedNfts();

      setSelectedStakedNft(null);
      alert("NFT withdrawn successfully.");
    } catch (err) {
      console.error("Withdraw failed:", err);
      alert(err?.shortMessage || err?.reason || "Failed to withdraw NFT");
    } finally {
      setTxLoading(false);
    }
  }

  useEffect(() => {
    loadStakedNfts();
  }, [wallet.provider, wallet.account, vaultData?.nftCount, mapping]);

  return (
    <Panel style={{ background: panel2 }}>
      {/* ... rest of your JSX remains unchanged ... */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowNftGallery((v) => !v)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyItems: "space-between",
          cursor: "pointer",
          textAlign: "left",
          marginBottom: showNftGallery ? 12 : 0,
        }}
      >
        {/* ... your existing header ... */}
      </div>

      {/* Rest of your component (buttons, galleries, etc.) stays the same */}
      {/* ... */}

    </Panel>
  );
}