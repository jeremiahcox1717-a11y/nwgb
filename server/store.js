const KEY = "nwgb-desk-v1";
let memory = null;

function blank() {
  return {
    version: 1,
    ownerName: "Jordan",
    given: [],
    leads: [],
    settings: {
      country: "GB",
      nation: "England",
      town: "",
      area: "",
      radiusMeters: 1600,
    },
  };
}

function read() {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
    } catch {
      return blank();
    }
  }
  return memory ? { ...blank(), ...JSON.parse(JSON.stringify(memory)) } : blank();
}

function write(data) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  }
  memory = JSON.parse(JSON.stringify(data));
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
