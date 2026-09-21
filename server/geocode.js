import { lookupUk, filterUk, usMetros, findCountry } from "./postcodes.js";
import { fetchJson } from "./http.js";

function nominatim(query, extras = {}) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", extras.limit || "5");
  url.searchParams.set("addressdetails", "1");
  if (extras.featureType) url.searchParams.set("featureType", extras.featureType);
  if (extras.countrycodes) url.searchParams.set("countrycodes", extras.countrycodes);
  return url.toString();
}

function isUkOutcode(compact) {
  return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(compact);
}

function isUkFull(compact) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact);
}

function looksLikePostcode(raw) {
  const compact = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact) return false;
  if (/^\d{5}(-\d{4})?$/.test(String(raw || "").trim())) return true;
  if (/^\d{5}$/.test(compact)) return true;
  if (isUkOutcode(compact) || isUkFull(compact)) return true;
  return false;
}

function averagePoint(rows) {
  if (!rows?.length) return null;
  const lat = rows.reduce((sum, row) => sum + Number(row.lat), 0) / rows.length;
  const lon = rows.reduce((sum, row) => sum + Number(row.lon), 0) / rows.length;
  return { lat, lon };
}

function pickCityHit(hits) {
  if (!Array.isArray(hits) || !hits.length) return null;
  const ranked = [...hits].sort((a, b) => {
    const rank = (hit) => {
      const type = `${hit.type || ""} ${hit.class || ""}`.toLowerCase();
      if (/(^|\s)(city|town)(\s|$)/.test(type)) return 0;
      if (/administrative/.test(type)) return 1;
      if (/village|suburb|municipality/.test(type)) return 2;
      return 3;
    };
    return rank(a) - rank(b) || Number(b.importance || 0) - Number(a.importance || 0);
  });
  return ranked[0];
}

function fromHit(hit, extras = {}) {
  const addr = hit.address || {};
  return {
    ok: true,
    postcode: addr.postcode || extras.postcode || "",
    display: hit.display_name,
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    town: addr.city || addr.town || addr.village || addr.municipality || extras.town || "",
    region: addr.state || addr.county || extras.region || "",
    nation: addr.country || extras.nation || "",
    country: extras.country || (addr.country_code || "").toUpperCase(),
    source: extras.source || "nominatim",
    kind: extras.kind || "place",
  };
}

export function resolveKnownCity({ city, country, language } = {}) {
  const name = String(city || "").trim();
  if (!name) return null;
  const countryRow = findCountry({ country, language });
  const code = countryRow?.code || String(country || "").trim().toUpperCase();

  if (code === "GB") {
    const rows = filterUk({
      nation: language === "Welsh" ? "Wales" : language === "Irish" ? "Northern Ireland" : language === "Scottish Gaelic" ? "Scotland" : "",
      city: name,
    });
    const point = averagePoint(rows);
    if (point) {
      return {
        ok: true,
        postcode: "",
        display: `${name}, United Kingdom`,
        lat: point.lat,
        lon: point.lon,
        town: name,
        region: rows[0]?.region || "",
        nation: rows[0]?.nation || "United Kingdom",
        country: "GB",
        source: "uk-city-average",
        kind: "city",
      };
    }
  }

  if (code === "US") {
    const metro = usMetros().find((row) => row.name.toLowerCase() === name.toLowerCase());
    if (metro) {
      return {
        ok: true,
        postcode: "",
        display: `${metro.name}, ${metro.state}, United States`,
        lat: null,
        lon: null,
        town: metro.name,
        region: metro.state,
        nation: "United States",
        country: "US",
        source: "us-metro",
        kind: "city",
        needsGeocode: true,
      };
    }
  }

  if (countryRow?.cities?.includes(name)) {
    return {
      ok: true,
      postcode: "",
      display: `${name}, ${countryRow.name}`,
      lat: null,
      lon: null,
      town: name,
      region: "",
      nation: countryRow.name,
      country: countryRow.code,
      source: "world-city",
      kind: "city",
      needsGeocode: true,
    };
  }

  return null;
}

export async function geocodePostcode(raw) {
  const compact = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact) {
    return { ok: false, error: "Need a postcode first." };
  }

  const looksUsZip = /^\d{5}$/.test(compact);
  const uk = lookupUk(compact);

  if (uk && (isUkOutcode(compact) || !isUkFull(compact))) {
    return {
      ok: true,
      postcode: uk.code,
      display: `${uk.code} · ${uk.town}`,
      lat: uk.lat,
      lon: uk.lon,
      town: uk.town,
      region: uk.region,
      nation: uk.nation,
      country: "GB",
      source: "uk-outcodes",
      kind: "postcode",
    };
  }

  if (isUkFull(compact)) {
    const spaced = compact.replace(/^(.*)(\d[A-Z]{2})$/, "$1 $2");
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(spaced)}`;
    const res = await fetchJson(url, { timeoutMs: 12000 });
    if (res.ok && res.json?.status === 200 && res.json.result) {
      const r = res.json.result;
      return {
        ok: true,
        postcode: r.postcode,
        display: r.postcode,
        lat: r.latitude,
        lon: r.longitude,
        town: r.admin_district || r.parish || "",
        region: r.region || "",
        nation: r.country || "England",
        country: "GB",
        source: "postcodes.io",
        kind: "postcode",
      };
    }
    if (uk) {
      return {
        ok: true,
        postcode: uk.code,
        display: `${uk.code} · ${uk.town}`,
        lat: uk.lat,
        lon: uk.lon,
        town: uk.town,
        region: uk.region,
        nation: uk.nation,
        country: "GB",
        source: "uk-outcodes-fallback",
        kind: "postcode",
      };
    }
  }

  const query = looksUsZip ? `${compact}, United States` : String(raw);
  const res = await fetchJson(nominatim(query), { timeoutMs: 12000 });
  const hit = Array.isArray(res.json) ? res.json[0] : null;
  if (!hit) {
    if (uk) {
      return {
        ok: true,
        postcode: uk.code,
        display: `${uk.code} · ${uk.town}`,
        lat: uk.lat,
        lon: uk.lon,
        town: uk.town,
        region: uk.region,
        nation: uk.nation,
        country: "GB",
        source: "uk-outcodes",
        kind: "postcode",
      };
    }
    return { ok: false, error: `Could not place ${raw} on a map.` };
  }

  return fromHit(hit, {
    postcode: looksUsZip ? compact : undefined,
    country: looksUsZip ? "US" : undefined,
    kind: "postcode",
  });
}

export async function geocodePlace(raw, hints = {}) {
  const text = String(raw || "").trim();
  if (!text) {
    return { ok: false, error: "Need a city name to hunt." };
  }

  if (looksLikePostcode(text)) {
    return geocodePostcode(text);
  }

  const known = resolveKnownCity({
    city: text,
    country: hints.country,
    language: hints.language,
  });
  if (known?.ok && known.lat != null && known.lon != null) {
    return known;
  }

  const countryRow = findCountry({
    country: hints.country || known?.country,
    language: hints.language,
  });
  const queryParts = [known?.town || text];
  if (known?.region) queryParts.push(known.region);
  if (countryRow?.name) queryParts.push(countryRow.name);
  else if (hints.country && hints.country.length > 2) queryParts.push(hints.country);

  const res = await fetchJson(
    nominatim(queryParts.join(", "), {
      featureType: "city",
      countrycodes: (countryRow?.code || known?.country || "").toLowerCase() || undefined,
      limit: "5",
    }),
    { timeoutMs: 12000 },
  );

  let hit = pickCityHit(res.json);
  if (!hit) {
    const fallback = await fetchJson(nominatim(queryParts.join(", "), { limit: "5" }), {
      timeoutMs: 12000,
    });
    hit = pickCityHit(fallback.json);
  }

  if (!hit) {
    return { ok: false, error: `Could not place ${text} on a map.` };
  }

  const geo = fromHit(hit, {
    town: known?.town || text,
    region: known?.region,
    nation: known?.nation || countryRow?.name,
    country: known?.country || countryRow?.code,
    source: known?.source === "us-metro" ? "us-metro+nominatim" : "nominatim-city",
    kind: "city",
  });
  if (!geo.town) geo.town = text;
  geo.postcode = "";
  return geo;
}
