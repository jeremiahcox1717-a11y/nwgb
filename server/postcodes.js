import { compactPostcode, outcodeFrom } from "./classify.js";
import { dataFile } from "./data-files.js";
import { getStore, updateStore } from "./store.js";

export function worldPlaces() {
  return dataFile("world-places.json");
}

export function ukOutcodes() {
  return dataFile("uk-outcodes.json");
}

export function usMetros() {
  return dataFile("us-metros.json");
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
  const world = worldPlaces();
  const places = [];
  for (const country of world.countries) {
    for (const language of country.languages) {
      places.push({
        continent: country.continent,
        language,
        country: country.name,
        countryCode: country.code,
        nation: "",
      });
    }
  }
  return {
    continents: world.continents,
    places,
  };
}

export function findCountry(filters = {}) {
  const code = String(filters.country || "").trim();
  const continent = String(filters.continent || "").trim();
  const language = String(filters.language || "").trim();
  return (
    worldPlaces().countries.find((row) => {
      if (code && row.code !== code && row.name !== code) return false;
      if (continent && row.continent !== continent) return false;
      if (language && !row.languages.includes(language)) return false;
      return Boolean(code || continent);
    }) ||
    worldPlaces().countries.find((row) => row.code === code) ||
    null
  );
}

export function matchPlace(filters = {}) {
  const country = findCountry(filters);
  if (!country) return null;
  const language = String(filters.language || "").trim() || country.languages[0] || "";
  return {
    continent: country.continent,
    language,
    country: country.name,
    countryCode: country.code,
    nation: nationForLanguage(country.code, language),
  };
}

function nationForLanguage(countryCode, language) {
  if (countryCode !== "GB") return "";
  if (language === "Welsh") return "Wales";
  if (language === "Irish") return "Northern Ireland";
  if (language === "Scottish Gaelic") return "Scotland";
  return "";
}

export function countriesFor(continent, language) {
  return worldPlaces()
    .countries.filter((row) => {
      if (continent && row.continent !== continent) return false;
      if (language && !row.languages.includes(language)) return false;
      return true;
    })
    .map((row) => ({ name: row.name, code: row.code }));
}

export function citiesFor(filters = {}) {
  const country = findCountry(filters);
  if (!country) return [];
  if (country.code === "US") return usMetros().map((metro) => metro.name);
  if (country.code === "GB") {
    const names = new Set();
    for (const row of filterUk({ nation: nationForLanguage("GB", filters.language), city: "" })) {
      if (row.town) names.add(row.town);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }
  return [...(country.cities || [])].sort((a, b) => a.localeCompare(b));
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

  if (country === "GB") {
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

  const record = findCountry({ ...filters, country });
  const listed = (record?.cities || []).some((name) => name.toLowerCase() === city.toLowerCase());
  if (!listed) {
    return {
      exhausted: true,
      remaining: 0,
      message: "Pick a city in that country.",
    };
  }
  return {
    exhausted: true,
    remaining: 0,
    message: `No stored postcodes for ${city} yet. Paste a local postcode into Hunt.`,
  };
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
  if (country === "GB") {
    const place = matchPlace(filters);
    return filterUk({ nation: place?.nation || "", city }).filter((row) => !used.has(compactPostcode(row.code))).length;
  }
  return 0;
}
