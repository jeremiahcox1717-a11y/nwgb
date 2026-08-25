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

export const PLACE_INDEX = [
  { continent: "Europe", language: "English", country: "United Kingdom", countryCode: "GB", nation: "" },
  { continent: "Europe", language: "Welsh", country: "United Kingdom", countryCode: "GB", nation: "Wales" },
  { continent: "Europe", language: "Irish", country: "United Kingdom", countryCode: "GB", nation: "Northern Ireland" },
  { continent: "Europe", language: "Scottish Gaelic", country: "United Kingdom", countryCode: "GB", nation: "Scotland" },
  { continent: "North America", language: "English", country: "United States", countryCode: "US", nation: "" },
];

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

export function placeCatalog() {
  return {
    continents: [...new Set(PLACE_INDEX.map((row) => row.continent))],
    places: PLACE_INDEX,
  };
}

export function matchPlace(filters = {}) {
  const continent = String(filters.continent || "").trim();
  const language = String(filters.language || "").trim();
  const country = String(filters.country || "").trim();
  return (
    PLACE_INDEX.find((row) => {
      if (continent && row.continent !== continent) return false;
      if (language && row.language !== language) return false;
      if (country && row.countryCode !== country && row.country !== country) return false;
      return continent || language || country;
    }) || null
  );
}

export function countriesFor(continent, language) {
  return PLACE_INDEX.filter((row) => {
    if (continent && row.continent !== continent) return false;
    if (language && row.language !== language) return false;
    return true;
  }).map((row) => ({ name: row.country, code: row.countryCode }));
}

export function citiesFor(filters = {}) {
  const place = matchPlace(filters);
  const country = filters.country || place?.countryCode || "";
  if (country === "US") return usMetros().map((metro) => metro.name);
  if (country === "GB") {
    const names = new Set();
    for (const row of filterUk({ nation: place?.nation || "", city: "" })) {
      if (row.town) names.add(row.town);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }
  return [];
}

function padZip(n) {
  return String(n).padStart(5, "0");
}

function usSequence(cityName) {
  const metro = usMetros().find((item) => item.name === cityName) || null;
  if (!metro) return { metro: null, codes: [] };
  const codes = [];
  for (const [start, end] of metro.ranges) {
    for (let n = start; n <= end; n += 1) codes.push(padZip(n));
  }
  return { metro, codes };
}

export function filterUk({ nation = "", city = "", town = "" } = {}) {
  const cityNeedle = String(city || town || "").trim().toLowerCase();
  const nationNeedle = String(nation || "").trim().toLowerCase();
  return ukOutcodes().filter((row) => {
    if (nationNeedle && nationNeedle !== "all") {
      if (String(row.nation).toLowerCase() !== nationNeedle) return false;
    }
    if (cityNeedle) {
      if (String(row.town).toLowerCase() !== cityNeedle) return false;
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

function countryOf(filters = {}) {
  return filters.country || matchPlace(filters)?.countryCode || "";
}

function cityOf(filters = {}) {
  return String(filters.city || filters.town || filters.metro || "").trim();
}

export function nextPostcode(filters = {}) {
  const country = countryOf(filters);
  const city = cityOf(filters);
  const place = matchPlace(filters);
  const used = givenSet();

  if (!country || !city) {
    return {
      exhausted: true,
      remaining: 0,
      message: "Pick a continent, language, country, then a city.",
    };
  }

  if (country === "US") {
    const { metro, codes } = usSequence(city);
    if (!metro) {
      return {
        exhausted: true,
        remaining: 0,
        message: "Pick a city in that country.",
      };
    }
    const code = codes.find((item) => !used.has(item));
    if (!code) {
      return {
        exhausted: true,
        remaining: 0,
        metro: metro.name,
        message: `Every ZIP in ${metro.name} has already been given.`,
      };
    }
    const remaining = codes.filter((item) => !used.has(item)).length - 1;
    return stampGiven(
      {
        code,
        compact: code,
        country: "US",
        town: metro.name,
        region: metro.state,
        nation: "United States",
        lat: null,
        lon: null,
      },
      remaining,
      { ...filters, country, city },
    );
  }

  const pool = filterUk({ nation: place?.nation || "", city });
  const unused = pool.filter((row) => !used.has(compactPostcode(row.code)));
  if (!unused.length) {
    return {
      exhausted: true,
      remaining: 0,
      message: "Every postcode in that city has already been given. Pick another city or restore one.",
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
    { ...filters, country, city },
  );
}

function stampGiven(ticket, remaining, filters = {}) {
  const record = {
    ...ticket,
    givenAt: new Date().toISOString(),
    hunts: 0,
  };
  updateStore((store) => {
    store.given.unshift(record);
    store.settings = {
      ...store.settings,
      continent: filters.continent || store.settings.continent || "",
      language: filters.language || store.settings.language || "",
      country: ticket.country,
      city: filters.city || ticket.town || "",
      town: filters.city || ticket.town || "",
      area: "",
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
      town: extra.town || extra.city || uk?.town || "",
      region: extra.region || uk?.region || "",
      nation: extra.nation || uk?.nation || "",
      lat: uk?.lat ?? extra.lat ?? null,
      lon: uk?.lon ?? extra.lon ?? null,
    },
    remainingCount(getStore().settings),
    extra,
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
  const country = countryOf(filters);
  const city = cityOf(filters);
  const used = givenSet();
  if (!country || !city) return 0;
  if (country === "US") {
    const { codes } = usSequence(city);
    return codes.filter((item) => !used.has(item)).length;
  }
  const place = matchPlace(filters);
  return filterUk({ nation: place?.nation || "", city }).filter((row) => !used.has(compactPostcode(row.code))).length;
}
