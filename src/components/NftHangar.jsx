import React, { useEffect, useState } from "react";
import { ethers } from "ethers";

import Panel from "./Panel.jsx";
import NeonButton from "./NeonButton.jsx";
import { green, panel2 } from "../styles/theme.js";

import { STAKING_ADDRESS } from "../config.js";
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

  async function stakeSelectedNft() {
    try {
      if (!wallet.account) {
        alert("Connect wallet first");
        return;
      }

      if (!selectedNft) {
        alert("Select an NFT first");
        return;
      }

      setTxLoading(true);
      await wallet.ensureCorrectNetwork();

      const signer = await wallet.getSigner();

      const nft = new ethers.Contract(
        selectedNft.nftAddress,
        EVGABI,
        signer
      );

      const staking = new ethers.Contract(
        STAKING_ADDRESS,
        stakingABI,
        signer
      );

      const tokenId = BigInt(selectedNft.tokenId);

      const approved = await nft.getApproved(tokenId);
      const approvedForAll = await nft.isApprovedForAll(
        wallet.account,
        STAKING_ADDRESS
      );

      if (
        approved.toLowerCase() !== STAKING_ADDRESS.toLowerCase() &&
        !approvedForAll
      ) {
        const approveTx = await nft.approve(STAKING_ADDRESS, tokenId);
        await approveTx.wait();
      }

      const stakeTx = await staking.stakeNFT(
        selectedNft.nftAddress,
        tokenId
      );

      await stakeTx.wait();

      await reloadVaultData?.();
      await reloadOwnedNfts();

      setSelectedNft(null);
      alert("NFT staked successfully.");
    } catch (err) {
      console.error("Stake NFT failed:", err);
      alert(err?.shortMessage || err?.reason || "Stake NFT failed");
    } finally {
      setTxLoading(false);
    }
  }

async function loadStakedNfts() {
  try {
    if (!wallet.provider || !wallet.account) {
      setStakedNfts([]);
      return;
    }

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      stakingABI,
      wallet.provider
    );

    const list = await staking.getUserNFTs(wallet.account);

    setStakedNfts(
      list.map((item) => ({
        nftAddress: item.collection,
        tokenId: item.tokenId.toString(),
      }))
    );
  } catch (err) {
    console.error("loadStakedNfts failed:", err);
  }
}

useEffect(() => {
  loadStakedNfts();
}, [wallet.provider, wallet.account, vaultData?.nftCount]);

async function withdrawSelectedNft() {
  try {
    if (!wallet.account) {
      alert("Connect wallet first");
      return;
    }

    if (!selectedStakedNft) {
      alert("Select a staked NFT first.");
      return;
    }

    if (
      Number(vaultData?.coreStaked || 0) > 0 &&
      Number(vaultData?.nftCount || 0) <= 1
    ) {
      alert("You must keep at least 1 NFT staked while CORE is staked.");
      return;
    }

    const confirmed = window.confirm("Withdraw this NFT from the vault?");
    if (!confirmed) return;

    setTxLoading(true);
    await wallet.ensureCorrectNetwork();

    const signer = await wallet.getSigner();

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      stakingABI,
      signer
    );

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
    console.error("Withdraw NFT failed:", err);
    alert(err?.shortMessage || err?.reason || "Withdraw NFT failed");
  } finally {
    setTxLoading(false);
  }
}

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
          boxSizing: "border-box",
          marginBottom: showNftGallery ? 12 : 0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: 1.1,
              marginBottom: 4,
            }}
          >
            NFT Hangar
          </div>

          <div
            style={{
              fontSize: isMobile ? 18 : 22,
              fontWeight: 900,
              color: green,
            }}
          >
            {vaultData?.nftCount || 0}/4 Boost Assets
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#9a9a9a",
              marginTop: 3,
            }}
          >
            Stake eligible NFTs to increase your vault weight
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
            boxShadow: "0 0 8px rgba(0,0,0,0.2)",
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
          {loading && (
            <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
              Loading NFTs...
            </div>
          )}

          {message && (
            <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8 }}>
              {message}
            </div>
          )}

          {!loading && ownedNFTs.length === 0 && (
            <div style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>
              No eligible NFTs found in this wallet.
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 6,
              marginBottom: 12,
            }}
          >
            {ownedNFTs.map((nft) => {
              const selected =
                selectedNft?.nftAddress?.toLowerCase() ===
                  nft.nftAddress?.toLowerCase() &&
                String(selectedNft?.tokenId) === String(nft.tokenId);

              const imageSrc = getNftImageSrc(nft, mapping);

              return (
                <div
                  key={`${nft.nftAddress}-${nft.tokenId}`}
                  onClick={() => setSelectedNft(nft)}
                  style={{
                    flex: "0 0 auto",
                    width: 96,
                    borderRadius: 8,
                    border: selected
                      ? "2px solid #3ea6ff"
                      : "1px solid #333",
                    background: "#111",
                    padding: 6,
                    cursor: "pointer",
                    textAlign: "center",
                    boxSizing: "border-box",
                  }}
                >
                  <img
                    src={imageSrc}
                    alt={nft.name || `NFT #${nft.tokenId}`}
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.png";
                    }}
                    style={{
                      width: "100%",
                      height: 76,
                      objectFit: "cover",
                      borderRadius: 6,
                      marginBottom: 4,
                    }}
                  />

                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {nft.name || `#${nft.tokenId}`}
                  </div>

                  <div
                    style={{
                      fontSize: 10,
                      color: "#aaa",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {nft.background || "Unknown"}
                  </div>
                </div>
              );
            })}
          </div>

{stakedNfts.length > 0 && (
  <>
    <div
      style={{
        fontSize: 12,
        color: "#888",
        textTransform: "uppercase",
        letterSpacing: 1.1,
        marginBottom: 8,
      }}
    >
      Staked NFTs
    </div>

    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        paddingBottom: 6,
        marginBottom: 12,
      }}
    >
      {stakedNfts.map((nft) => {
        const selected =
          selectedStakedNft?.nftAddress?.toLowerCase() ===
            nft.nftAddress?.toLowerCase() &&
          String(selectedStakedNft?.tokenId) === String(nft.tokenId);

        const imageSrc = getNftImageSrc(nft, mapping);

        return (
          <div
            key={`staked-${nft.nftAddress}-${nft.tokenId}`}
            onClick={() => setSelectedStakedNft(nft)}
            style={{
              flex: "0 0 auto",
              width: 96,
              borderRadius: 8,
              border: selected ? "2px solid #ffcc66" : "1px solid #333",
              background: "#111",
              padding: 6,
              cursor: "pointer",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            <img
              src={imageSrc}
              alt={`Staked NFT #${nft.tokenId}`}
              onError={(e) => {
                e.currentTarget.src = "/placeholder.png";
              }}
              style={{
                width: "100%",
                height: 76,
                objectFit: "cover",
                borderRadius: 6,
                marginBottom: 4,
              }}
            />

            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#fff",
              }}
            >
              #{nft.tokenId}
            </div>

            <div
              style={{
                fontSize: 10,
                color: "#ffcc66",
              }}
            >
              Staked
            </div>
          </div>
        );
      })}
    </div>
  </>
)}

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <NeonButton
              variant="green"
              onClick={stakeSelectedNft}
              disabled={!wallet.account || !selectedNft || txLoading}
              style={{
                flex: isMobile ? "1 1 100%" : "1 1 auto",
              }}
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
    (
      Number(vaultData?.coreStaked || 0) > 0 &&
      Number(vaultData?.nftCount || 0) <= 1
    )
  }
  style={{
    flex: isMobile ? "1 1 100%" : "1 1 auto",
  }}
>
  {txLoading ? "Processing..." : "Withdraw Selected NFT"}
</NeonButton>
          </div>
        </>
      )}
    </Panel>
  );
}