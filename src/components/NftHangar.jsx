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
          justifyContent: "space-between",
          cursor: "pointer",
          textAlign: "left",
          marginBottom: showNftGallery ? 12 : 0,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 }}>
            NFT Hangar
          </div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: green }}>
            {vaultData?.nftCount || 0}/4 Boost Assets
          </div>
          <div style={{ fontSize: 12, color: "#9a9a9a", marginTop: 3 }}>
            Stake eligible NFTs • Max 1 per unique name
          </div>
        </div>

        <div
          style={{
            minWidth: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid #2f2f2f",
            background: "#151515",
            color: green,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 900,
          }}
        >
          {showNftGallery ? "−" : "+"}
        </div>
      </div>

      <NeonButton
        variant="dark"
        onClick={refreshOwnedNfts}
        disabled={!wallet.account || loading}
        style={{ marginBottom: 12 }}
      >
        {loading ? "Refreshing..." : "Refresh NFTs"}
      </NeonButton>

      {showNftGallery && (
        <>
          {loading && <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>Loading NFTs...</div>}
          {message && <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8 }}>{message}</div>}

          {!loading && ownedNFTs.length === 0 && (
            <div style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>
              No eligible NFTs found in this wallet.
            </div>
          )}

          {/* Owned NFTs */}
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginBottom: 16 }}>
            {ownedNFTs.map((nft) => {
              const nftName = getNftName(nft);
              const isNameStaked = nftName && stakedNames.has(nftName);
              const isSelected =
                selectedNft?.nftAddress?.toLowerCase() === nft.nftAddress?.toLowerCase() &&
                String(selectedNft?.tokenId) === String(nft.tokenId);

              return (
                <div
                  key={`${nft.nftAddress}-${nft.tokenId}`}
                  onClick={() => !isNameStaked && setSelectedNft(nft)}
                  style={{
                    flex: "0 0 auto",
                    width: 96,
                    borderRadius: 8,
                    border: isSelected
                      ? "2px solid #3ea6ff"
                      : isNameStaked
                      ? "2px solid #666"
                      : "1px solid #333",
                    background: isNameStaked ? "#1a1a1a" : "#111",
                    padding: 6,
                    cursor: isNameStaked ? "not-allowed" : "pointer",
                    opacity: isNameStaked ? 0.6 : 1,
                    textAlign: "center",
                  }}
                >
                  <img
                    src={getNftImageSrc(nft, mapping)}
                    alt={nftName || `#${nft.tokenId}`}
                    onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                    style={{ width: "100%", height: 76, objectFit: "cover", borderRadius: 6 }}
                  />
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", marginTop: 4 }}>
                    {nftName || `#${nft.tokenId}`}
                  </div>
                  {isNameStaked && <div style={{ fontSize: 10, color: "#ff6666" }}>Already Staked</div>}
                </div>
              );
            })}
          </div>

          {/* Staked NFTs */}
          {stakedNfts.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 8 }}>
                Currently Staked
              </div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginBottom: 16 }}>
                {stakedNfts.map((nft) => {
                  const isSelected =
                    selectedStakedNft?.nftAddress?.toLowerCase() === nft.nftAddress?.toLowerCase() &&
                    String(selectedStakedNft?.tokenId) === String(nft.tokenId);

                  return (
                    <div
                      key={`staked-${nft.nftAddress}-${nft.tokenId}`}
                      onClick={() => setSelectedStakedNft(nft)}
                      style={{
                        flex: "0 0 auto",
                        width: 96,
                        borderRadius: 8,
                        border: isSelected ? "2px solid #ffcc66" : "1px solid #333",
                        background: "#111",
                        padding: 6,
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      <img
                        src={getNftImageSrc(nft, mapping)}
                        alt={nft.name || `#${nft.tokenId}`}
                        onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                        style={{ width: "100%", height: 76, objectFit: "cover", borderRadius: 6 }}
                      />
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", marginTop: 4 }}>
                        {nft.name || `#${nft.tokenId}`}
                      </div>
                      <div style={{ fontSize: 10, color: "#ffcc66" }}>Staked</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <NeonButton
              variant="green"
              onClick={stakeSelectedNft}
              disabled={!wallet.account || !selectedNft || txLoading}
              style={{ flex: isMobile ? "1 1 100%" : "1 1 auto" }}
            >
              {txLoading ? "Processing..." : "Stake Selected NFT"}
            </NeonButton>

            <NeonButton
              variant="dark"
              onClick={withdrawSelectedNft}
              disabled={
                txLoading ||
                !wallet.account ||
                !selectedStakedNft ||
                (Number(vaultData?.coreStaked || 0) > 0 && Number(vaultData?.nftCount || 0) <= 1)
              }
              style={{ flex: isMobile ? "1 1 100%" : "1 1 auto" }}
            >
              {txLoading ? "Processing..." : "Withdraw Selected NFT"}
            </NeonButton>
          </div>
        </>
      )}
    </Panel>
  );
}