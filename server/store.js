import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function storePath() {
  return process.env.NWGB_STORE || path.join(__dirname, "..", "data", "desk.json");
}

function blank() {
  return {
    version: 1,
    ownerName: process.env.OWNER_NAME || "Jordan",
    given: [],
    leads: [],
    settings: {
      continent: "",
      language: "",
      country: "",
      city: "",
      radiusMeters: 1600,
    },
  };
}

function read() {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    return { ...blank(), ...JSON.parse(raw) };
  } catch {
    return blank();
  }
}

function write(data) {
  const target = storePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, target);
  return data;
}

export function getStore() {
  return read();
}

export function updateStore(mutator) {
  const current = read();
  const next = mutator(current) || current;
  return write(next);
}

export function isGiven(code) {
  const compact = String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return read().given.some((row) => row.compact === compact);
}

export { storePath };
