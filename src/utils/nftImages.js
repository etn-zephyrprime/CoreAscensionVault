import {
  BACKEND_URL,
  VKIN_CONTRACT_ADDRESS,
  VQLE_CONTRACT_ADDRESS,
  SCIONS_CONTRACT_ADDRESS,
  EVG_CONTRACT_ADDRESS,
} from "../config.js";

export const COLLECTION_IMAGE_FORMATS = {
  EVG: "webp",
  //SCIONS: "png",
  //VQLE: "png",
  //VKIN: "png",
};

export function getCollectionKey(address) {
  const raw = String(address || "").toLowerCase();

//  if (raw === VKIN_CONTRACT_ADDRESS.toLowerCase()) return "VKIN";
//  if (raw === VQLE_CONTRACT_ADDRESS.toLowerCase()) return "VQLE";
//  if (raw === SCIONS_CONTRACT_ADDRESS.toLowerCase()) return "SCIONS";
  if (raw === EVG_CONTRACT_ADDRESS.toLowerCase()) return "EVG";

  return null;
}

export function getNftImageSrc(nft, mapping = {}) {
  const collectionKey = getCollectionKey(nft.nftAddress || nft.collection);
  if (!collectionKey) return "/placeholder.png";

  const tokenId = String(nft.tokenId);
  const mapped = mapping?.[collectionKey]?.[tokenId];
  const format = COLLECTION_IMAGE_FORMATS[collectionKey] || "webp";

  const imageFile =
    mapped?.image_file ||
    mapped?.token_uri?.replace(/\.json$/i, `.${format}`) ||
    nft.imageFile ||
    `${tokenId}.${format}`;

  return `${BACKEND_URL}/images/${collectionKey}/${imageFile}`;
}