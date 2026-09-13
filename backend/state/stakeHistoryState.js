import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// Replaces githubSync.js's GitHub Contents API push/pull — that mechanism made a REAL commit to
// `main` on every single history update (stakeHistoryService.js's poller runs hourly by design,
// but was observed live committing roughly every 30-40 SECONDS instead, almost certainly a
// crash-restart loop re-running the poller's unconditional "initial update" on every boot). Since
// this repo's `main` is what Vercel auto-deploys from, every one of those commits triggered a full
// production build — confirmed via the account's own September invoice: ~12.85 days of cumulative
// Build CPU Minutes ($63.97 of a $53.91 total bill), while actual traffic/bandwidth cost ~$0.
//
// Same R2 JSON-blob convention as ETNSubdomainService's backend/state/*.js files (e.g.
// notisLinkState.js) — a plain object written/read as one blob, no git commit involved at all, so
// updating this as often as the poller wants costs nothing and never touches the deploy pipeline.
const STATE_KEY = "stake-history.json";

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

/** Reads the persisted stake-history state blob, or null if never written (or R2 isn't
 * configured) — the caller (stakeHistoryService.js's loadHistory) already has its own "nothing
 * anywhere yet, start fresh" fallback for that case, same as the old GitHub-pull path did. */
export async function getStakeHistoryState() {
  const r2 = getR2Client();
  if (!r2) return null;

  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: STATE_KEY }));
    return JSON.parse(await res.Body.transformToString());
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey") {
      return null; // never written yet
    }
    console.error("⚠️  Failed to read stake history state from R2:", err.message);
    return null;
  }
}

/** Persists the full stake-history state blob. No-ops (logs and returns) if R2 isn't configured —
 * same "optional feature, never throws" convention every R2-backed state file in this ecosystem
 * follows, so a missing R2 config degrades to local-file-only persistence rather than crashing the
 * poller. */
export async function setStakeHistoryState(state) {
  const r2 = getR2Client();
  if (!r2) {
    console.warn("ℹ️  R2 not configured (R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME) — stake history only persisted locally, will not survive a redeploy.");
    return;
  }

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
    console.error("⚠️  Failed to write stake history state to R2:", err.message);
  }
}
