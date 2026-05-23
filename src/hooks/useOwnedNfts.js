import { useCallback, useEffect, useState } from "react";
import { BACKEND_URL } from "../config.js";

export function useOwnedNfts(account) {
  const [ownedNFTs, setOwnedNFTs] = useState([]);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

const loadOwnedNfts = useCallback(async () => {
  if (!account) {
    setOwnedNFTs([]);
    return;
  }

  try {
    setLoading(true);
    setMessage("");

    const url = `${BACKEND_URL}/nfts/owned/${account}`;
    console.log("Loading NFTs from:", url);

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`NFT API failed: ${res.status}`);
    }

    const data = await res.json();

    console.log("NFT API response:", data);

    // Support multiple backend shapes
    const allNfts = Array.isArray(data)
      ? data
      : data.ownedNFTs ||
        data.nfts ||
        data.tokens ||
        [];

    // ONLY EVG NFTs
    const filtered = allNfts.filter((nft) => {
      const addr =
        nft.nftAddress ||
        nft.address ||
        nft.contractAddress ||
        nft.collectionAddress;

      return (
        addr?.toLowerCase() ===
        "0x5c81a5609eaeef7962f1d089d6343f9790387901"
      );
    });

    console.log("Filtered EVG NFTs:", filtered);

    setOwnedNFTs(filtered);
    setMapping(data.mapping || {});
  } catch (err) {
    console.error("loadOwnedNfts failed:", err);
    setMessage("Failed to load NFTs.");
  } finally {
    setLoading(false);
  }
}, [account]);

  useEffect(() => {
    loadOwnedNfts();
  }, [loadOwnedNfts]);

const refreshOwnedNfts = useCallback(async () => {
  if (!account) {
    setMessage("Connect your wallet before refreshing NFTs.");
    return;
  }

  try {
    setLoading(true);
    setMessage("Refreshing NFT cache...");

    const url = `${BACKEND_URL}/nfts/owned/${account}?refresh=true`;
    console.log("Refreshing NFTs from:", url);

    const res = await fetch(url);

    if (!res.ok) {
      let errorMessage = `Refresh failed: ${res.status}`;

      try {
        const errorData = await res.json();

        if (res.status === 429 && errorData.retryAfterMs) {
          const minutes = Math.ceil(errorData.retryAfterMs / 60000);
          errorMessage = `NFT refresh is on cooldown. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // keep default message
      }

      throw new Error(errorMessage);
    }

    const data = await res.json();

    const allNfts = Array.isArray(data)
      ? data
      : data.ownedNFTs ||
        data.nfts ||
        data.tokens ||
        [];

    const filtered = allNfts.filter((nft) => {
      const addr =
        nft.nftAddress ||
        nft.address ||
        nft.contractAddress ||
        nft.collectionAddress;

      return (
        addr?.toLowerCase() ===
        "0x5c81a5609eaeef7962f1d089d6343f9790387901"
      );
    });

    setOwnedNFTs(filtered);
    setMapping(data.mapping || {});
    setMessage("NFT cache refreshed.");
  } catch (err) {
    console.error("refreshOwnedNfts failed:", err);
    setMessage(err.message || "Failed to refresh NFT cache.");
  } finally {
    setLoading(false);
  }
}, [account]);
  
  return {
    ownedNFTs,
    mapping,
    loading,
    message,
    reloadOwnedNfts: loadOwnedNfts,
    refreshOwnedNfts,
  };
}