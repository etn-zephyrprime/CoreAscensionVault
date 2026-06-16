// utils/githubSync.js
const GITHUB_API = "https://api.github.com";
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;

function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

const DEFAULT_FILE = "backend/data/stake-history.json";

function getPath(filePath) {
  return filePath || DEFAULT_FILE;
}


// Pull latest JSON from GitHub
export async function pullHistoryFromGitHub(filePath = DEFAULT_FILE) {
  if (!TOKEN || !REPO) return null;

  const path = getPath(filePath);

  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: headers() }
    );

    if (!res.ok) return null;

    const data = await res.json();

    const content = JSON.parse(
      Buffer.from(data.content, "base64").toString("utf8")
    );

    console.log(`📥 Pulled ${path} from GitHub`);

    return {
      content,
      sha: data.sha
    };

  } catch (e) {
    console.warn("Could not pull from GitHub:", e.message);
    return null;
  }
}


// Push JSON to GitHub
export async function pushHistoryToGitHub(data, filePath = DEFAULT_FILE) {
  if (!TOKEN || !REPO) return;

  const path = getPath(filePath);

  try {

    // always fetch latest SHA immediately before PUT
    const getRes = await fetch(
      `${GITHUB_API}/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: headers() }
    );

    const existing = getRes.ok
      ? await getRes.json()
      : null;

    const sha = existing?.sha;

    const content = Buffer
      .from(JSON.stringify(data, null, 2))
      .toString("base64");


    const putRes = await fetch(
      `${GITHUB_API}/repos/${REPO}/contents/${path}`,
      {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({
          message: `chore: update ${path} ${new Date().toISOString()}`,
          content,
          branch: BRANCH,
          ...(sha ? { sha } : {})
        })
      }
    );


    if (putRes.status === 409) {
      console.log("🔄 SHA conflict, retrying...");

      // get the newest SHA and try once more
      const retryGet = await fetch(
        `${GITHUB_API}/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
        { headers: headers() }
      );

      const retryFile = await retryGet.json();

      const retryPut = await fetch(
        `${GITHUB_API}/repos/${REPO}/contents/${path}`,
        {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({
            message: `chore: retry update ${path}`,
            content,
            branch: BRANCH,
            sha: retryFile.sha
          })
        }
      );

      if (!retryPut.ok) {
        throw new Error(await retryPut.text());
      }

      console.log(`📤 Retry push succeeded: ${path}`);
      return;
    }


    if (!putRes.ok) {
      throw new Error(await putRes.text());
    }


    console.log(`📤 Pushed ${path} to GitHub`);

  } catch(e) {
    console.warn("Could not push to GitHub:", e.message);
  }
}