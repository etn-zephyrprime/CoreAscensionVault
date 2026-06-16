// backend/utils/blockState.js
import fs from "fs";
import path from "path";
import { withLock } from "./mutex.js";
import { pullHistoryFromGitHub, pushHistoryToGitHub } from "./githubSync.js";

const DATA_DIR = fs.existsSync("/backend/data")
  ? "/backend/data/state"
  : path.join(process.cwd(), "state");

const STATE_FILE = path.join(DATA_DIR, "lastBlock.json");

function ensureStateDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function loadStateFile() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf8");

      if (raw) {
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error("Local state load failed:", err);
  }

  console.log("📥 Loading lastBlock.json from GitHub...");

  try {
const remote = await pullHistoryFromGitHub(
  "backend/state/lastBlock.json"
);

    if (remote?.content) {
      ensureStateDir();

      fs.writeFileSync(
        STATE_FILE,
        JSON.stringify(remote.content, null, 2)
      );

      return remote.content;
    }
  } catch (err) {
    console.error("GitHub state restore failed:", err.message);
  }

  return {};
}

async function saveStateFile(state) {
    try {
    ensureStateDir();

    const tempFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(
      tempFile,
      JSON.stringify(state, null, 2),
      "utf8"
    );
fs.renameSync(tempFile, STATE_FILE);

pushHistoryToGitHub(
  state,
  "backend/state/lastBlock.json"
)
  .catch(err =>
    console.error("❌ lastBlock GitHub push failed:", err.message)
  );
  } catch (err) {
    console.error("saveStateFile error:", err);
    throw err;
  }
}

export async function loadLastBlock(key = "lastBlock") {
const state = await loadStateFile();
  return state[key] ?? null;
}

export async function saveLastBlock(key = "lastBlock", block) {
const state = await loadStateFile();
await saveStateFile(state);
  state[key] = block;
}

export async function loadLastBlockLocked(key = "lastBlock") {
  return withLock(async () => {
    return await loadLastBlock(key);
  });
}

export async function saveLastBlockLocked(key = "lastBlock", block) {
  return withLock(async () => {
    await saveLastBlock(key, block);
    return block;
  });
}