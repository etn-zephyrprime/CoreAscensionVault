export const CHAIN_ID = 52014; // Electroneum mainnet (example)
export const RPC_URL = "https://rpc.ankr.com/electroneum";
export const IPFS_BASE = "https://ipfs.io/ipfs/QmZMPmh6qg31NqH5tFKoQ5k3uMDBNMxkQUS7tyqCZstUNv/";
export const VQLE_IPFS_BASE = "https://ipfs.io/ipfs/bafybeic2zhpgnjbzmvzxnsdjhs74aym5j7ain4kgwgat3dym53g3sbmghe/";
export const SCIONS_IPFS_BASE = "https://ipfs.io/ipfs/bafybeihcaoobdmhitup57xyoousraea3ik27ri4727jlbl7bgmbvbm3ffa/";
export const EVG_IPFS_BASE = "https://ipfs.io/ipfs/bafybeiak2sh4cyfyx5xxldcfppfkoibjpnwcnt7ltdog5vej2buh7xy26i/";
export const RARE_BACKGROUNDS = ["Gold"];
export const CORE_TOKEN = "0x309B916b3A90cb3E071697Ea9680e9217A30066f";
export const ADMIN_ADDRESS = "0x3Fd2e5B4AC0efF6DFDF2446abddAB3f66B425099"
export const BACKEND_URL = import.meta.env.VITE_GAME_API_URL || "http://localhost:4000";
export const EXPLORER_BASE_URL = "https://blockexplorer.electroneum.com";
export const STAKING_ADDRESS = "0x3764280F654d780d75463304f1ade8017d6e1cFD";
export const DRIP_FUNDER_ADDRESS = "0x219341313B6142343C3003f3e2CAec96779cf8ED";

console.log("BACKEND_URL =", BACKEND_URL);

// ---------------- WHITELISTED TOKENS ----------------
export const WHITELISTED_TOKENS = [
  { label: "CORE", address: CORE_TOKEN }
];

// ---------------- WHITELISTED NFTs ----------------
export const WHITELISTED_NFTS = [
  { label: "Verdant Kin", address: "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4" },
  { label: "Verdant Queen", address: "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0" },
  { label: "Aether Scions", address: "0xAc620b1A3dE23F4EB0A69663613baBf73F6C535D" },
  { label: "Guardians of Erevos", address: "0x5C81a5609EaeEF7962F1D089D6343F9790387901" }
];

export const VKIN_CONTRACT_ADDRESS = "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4";
export const VQLE_CONTRACT_ADDRESS = "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0";
export const SCIONS_CONTRACT_ADDRESS = "0xAc620b1A3dE23F4EB0A69663613baBf73F6C535D";
export const EVG_CONTRACT_ADDRESS = "0x5C81a5609EaeEF7962F1D089D6343F9790387901";

// src/constants/collections.js (recommended) or inside renderTokenImages.jsx
export const ADDRESS_TO_COLLECTION_KEY = {
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4": "VKIN",
  "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0": "VQLE",
  "0xAc620b1A3dE23F4EB0A69663613baBf73F6C535D": "SCIONS",
  "0x5C81a5609EaeEF7962F1D089D6343F9790387901": "EVG",
};