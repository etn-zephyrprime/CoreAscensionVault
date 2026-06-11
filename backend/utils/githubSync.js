// utils/githubSync.js
const GITHUB_API = "https://api.github.com";
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "backend/data/stake-history.json"; // path inside your repo

function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

// Pull latest JSON from GitHub — call this on cold start
export async function pullHistoryFromGitHub() {
  if (!TOKEN || !REPO) return null;
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
      { headers: headers() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
    console.log("📥 Pulled stake-history from GitHub");
    return { content, sha: data.sha };
  } catch (e) {
    console.warn("Could not pull from GitHub:", e.message);
    return null;
  }
}

// Push updated JSON to GitHub — call this after every saveHistory()
export async function pushHistoryToGitHub(historyData) {
  if (!TOKEN || !REPO) return;
  try {
    // Get current SHA (needed for update)
    const getRes = await fetch(
      `${GITHUB_API}/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
      { headers: headers() }
    );
    const existing = getRes.ok ? await getRes.json() : null;
    const sha = existing?.sha;

    const content = Buffer.from(JSON.stringify(historyData, null, 2)).toString("base64");

    await fetch(
      `${GITHUB_API}/repos/${REPO}/contents/${FILE_PATH}`,
      {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({
          message: `chore: update stake-history ${new Date().toISOString()}`,
          content,
          branch: BRANCH,
          ...(sha ? { sha } : {}),
        }),
      }
    );
    console.log("📤 Pushed stake-history to GitHub");
  } catch (e) {
    console.warn("Could not push to GitHub:", e.message);
  }
}