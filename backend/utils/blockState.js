// backend/utils/blockState.js
import fs from "fs";
import path from "path";
import { withLock } from "./mutex.js";
import { getLastBlockState, setLastBlockState } from "../state/lastBlockState.js";

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

  console.log("📥 Loading lastBlock state from R2...");

  try {
    const remote = await getLastBlockState();

    if (remote) {
      ensureStateDir();
      fs.writeFileSync(STATE_FILE, JSON.stringify(remote, null, 2));
      return remote;
    }
  } catch (err) {
    console.error("R2 state restore failed:", err.message);
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

    setLastBlockState(state).catch((err) =>
      console.error("❌ lastBlock R2 push failed:", err.message)
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

// Bug fix: the block value must be set BEFORE saving, not after — this previously saved the
// state exactly as loaded (missing the very update this call exists to persist), since
// saveStateFile synchronously serializes `state` before the caller ever mutated it.
export async function saveLastBlock(key = "lastBlock", block) {
  const state = await loadStateFile();
  state[key] = block;
  await saveStateFile(state);
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
