import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// Replaces githubSync.js's GitHub Contents API push/pull for lastBlock.json — same reasoning as
// stakeHistoryState.js's own header comment (that file's the primary offender; this was a SECOND,
// independent source of the exact same problem: blockState.js's saveStateFile fire-and-forget
// pushed this file to GitHub on every save too, doubling the commit rate on top of
// stakeHistoryService.js's own push). A separate R2 key (not reusing stakeHistoryState.js's) since
// this is a genuinely different blob (`{ [key]: blockNumber }`, not the stake history object).
const STATE_KEY = "last-block.json";

let cachedR2Client = null;
function getR2Client() {
  if (cachedR2Client) return cachedR2Client;
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return null;
  }
  cachedR2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cachedR2Client;
}

/** Reads the persisted { [key]: blockNumber, ... } blob, or null if never written (or R2 isn't
 * configured) — blockState.js's own loadStateFile already falls back to `{}` in that case. */
export async function getLastBlockState() {
  const r2 = getR2Client();
  if (!r2) return null;

  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: STATE_KEY }));
    return JSON.parse(await res.Body.transformToString());
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey") {
      return null; // never written yet
    }
    console.error("⚠️  Failed to read last-block state from R2:", err.message);
    return null;
  }
}

/** Persists the full { [key]: blockNumber, ... } blob. No-ops if R2 isn't configured — same
 * "optional feature, never throws" convention as every other R2-backed state file here. */
export async function setLastBlockState(state) {
  const r2 = getR2Client();
  if (!r2) return;

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: STATE_KEY,
        Body: JSON.stringify(state, null, 2),
        ContentType: "application/json",
      })
    );
  } catch (err) {
    console.error("⚠️  Failed to write last-block state to R2:", err.message);
  }
}
