import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compactPostcode, outcodeFrom } from "./classify.js";
import { getStore, updateStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UK_PATH = path.join(__dirname, "..", "data", "uk-outcodes.json");
const US_PATH = path.join(__dirname, "..", "data", "us-metros.json");

let ukCache;
let usCache;

export function ukOutcodes() {
  if (!ukCache) {
    ukCache = JSON.parse(fs.readFileSync(UK_PATH, "utf8"));
  }
  return ukCache;
}

export function usMetros() {
  if (!usCache) {
    usCache = JSON.parse(fs.readFileSync(US_PATH, "utf8"));
  }
  return usCache;
}

export function ukTowns() {
  const counts = new Map();
  for (const row of ukOutcodes()) {
    if (!row.town) continue;
    counts.set(row.town, (counts.get(row.town) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([town, count]) => ({ town, count }));
}

function padZip(n) {
  return String(n).padStart(5, "0");
}

function usSequence(metroName) {
  const metro = usMetros().find((m) => m.name === metroName) || usMetros()[0];
  const codes = [];
  for (const [start, end] of metro.ranges) {
    for (let n = start; n <= end; n += 1) codes.push(padZip(n));
  }
  return { metro, codes };
}

export function filterUk({ nation = "", town = "", area = "" } = {}) {
  const areaCompact = compactPostcode(area);
  const townNeedle = String(town || "").trim().toLowerCase();
  const nationNeedle = String(nation || "").trim().toLowerCase();
  return ukOutcodes().filter((row) => {
    if (nationNeedle && nationNeedle !== "all") {
      if (String(row.nation).toLowerCase() !== nationNeedle) return false;
    }
    if (townNeedle) {
      const hay = `${row.town} ${row.region}`.toLowerCase();
      if (!hay.includes(townNeedle)) return false;
    }
    if (areaCompact) {
      if (!compactPostcode(row.code).startsWith(areaCompact)) return false;
    }
    return true;
  });
}

export function lookupUk(code) {
  const out = outcodeFrom(code);
  return ukOutcodes().find((row) => compactPostcode(row.code) === compactPostcode(out)) || null;
}

export function givenSet() {
  return new Set(getStore().given.map((row) => row.compact));
}

export function nextPostcode(filters = {}) {
  const country = filters.country || "GB";
  const used = givenSet();

  if (country === "US") {
    const { metro, codes } = usSequence(filters.metro);
    const code = codes.find((c) => !used.has(c));
    if (!code) {
      return {
        exhausted: true,
        remaining: 0,
        metro: metro.name,
        message: `Every ZIP in ${metro.name} has already been given.`,
      };
    }
    const remaining = codes.filter((c) => !used.has(c)).length - 1;
    return stampGiven({
      code,
      compact: code,
      country: "US",
      town: metro.name,
      region: metro.state,
      nation: "United States",
      lat: null,
      lon: null,
    }, remaining);
  }

  const pool = filterUk(filters);
  const unused = pool.filter((row) => !used.has(compactPostcode(row.code)));
  if (!unused.length) {
    return {
      exhausted: true,
      remaining: 0,
      message: "Every postcode in that filter has already been given. Loosen the town/area or restore one.",
    };
  }
  const row = unused[0];
  return stampGiven(
    {
      code: row.code,
      compact: compactPostcode(row.code),
      country: "GB",
      town: row.town,
      region: row.region,
      nation: row.nation,
      lat: row.lat,
      lon: row.lon,
    },
    unused.length - 1,
  );
}

function stampGiven(ticket, remaining) {
  const record = {
    ...ticket,
    givenAt: new Date().toISOString(),
    hunts: 0,
  };
  updateStore((store) => {
    store.given.unshift(record);
    store.settings = {
      ...store.settings,
      country: ticket.country,
      nation: ticket.nation === "United States" ? store.settings.nation : ticket.nation,
      town: store.settings.town,
      area: store.settings.area,
    };
    return store;
  });
  return { ...record, remaining, exhausted: false };
}

export function markGiven(code, extra = {}) {
  const compact = compactPostcode(code);
  if (!compact) return null;
  const existing = getStore().given.find((row) => row.compact === compact);
  if (existing) {
    updateStore((store) => {
      const row = store.given.find((item) => item.compact === compact);
      if (row) {
        row.hunts = (row.hunts || 0) + (extra.hunt ? 1 : 0);
        Object.assign(row, extra.fields || {});
      }
      return store;
    });
    return existing;
  }
  const uk = lookupUk(code);
  return stampGiven(
    {
      code: uk?.code || String(code).toUpperCase().trim(),
      compact,
      country: extra.country || (uk ? "GB" : "GB"),
      town: extra.town || uk?.town || "",
      region: extra.region || uk?.region || "",
      nation: extra.nation || uk?.nation || "",
      lat: uk?.lat ?? extra.lat ?? null,
      lon: uk?.lon ?? extra.lon ?? null,
    },
    filterUk(getStore().settings).length,
  );
}

export function undoLastGiven() {
  let removed = null;
  updateStore((store) => {
    removed = store.given.shift() || null;
    return store;
  });
  return removed;
}

export function restoreGiven(compact) {
  let restored = null;
  updateStore((store) => {
    const idx = store.given.findIndex((row) => row.compact === compactPostcode(compact));
    if (idx >= 0) restored = store.given.splice(idx, 1)[0];
    return store;
  });
  return restored;
}

export function remainingCount(filters = {}) {
  const used = givenSet();
  if ((filters.country || "GB") === "US") {
    const { codes } = usSequence(filters.metro);
    return codes.filter((c) => !used.has(c)).length;
  }
  return filterUk(filters).filter((row) => !used.has(compactPostcode(row.code))).length;
}
