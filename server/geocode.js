import { lookupUk } from "./postcodes.js";
import { fetchJson } from "./http.js";

function nominatim(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  return url.toString();
}

function isUkOutcode(compact) {
  return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(compact);
}

function isUkFull(compact) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact);
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
      };
    }
    return { ok: false, error: `Could not place ${raw} on a map.` };
  }

  const addr = hit.address || {};
  return {
    ok: true,
    postcode: addr.postcode || String(raw).toUpperCase(),
    display: hit.display_name,
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    town: addr.city || addr.town || addr.village || addr.suburb || "",
    region: addr.state || addr.county || "",
    nation: addr.country || "",
    country: looksUsZip ? "US" : (addr.country_code || "").toUpperCase(),
    source: "nominatim",
  };
}
