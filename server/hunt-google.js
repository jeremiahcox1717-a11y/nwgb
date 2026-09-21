import { fetchText, sleep } from "./http.js";
import {
  classifyOnlinePresence,
  instagramHandleFromUrl,
  isChainName,
  isRealWebsite,
  scoreLead,
  snippetSuggestsWebsiteOrBooking,
} from "./classify.js";
import { dataFile } from "./data-files.js";
import {
  googlePlaceTypesFor,
  googleTextQueriesFor,
  instagramHuntPlans,
  looksLikeHairTrade,
} from "./niches.js";
import { assessWebsiteUrl, inspectWebsite } from "./website-quality.js";

function chains() {
  return dataFile("chains.json");
}

function googleKey() {
  if (typeof process !== "undefined" && process.env?.GOOGLE_PLACES_API_KEY) {
    return process.env.GOOGLE_PLACES_API_KEY;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("GOOGLE_PLACES_API_KEY") || "";
  }
  return "";
}

const PLACES_FIELD_MASK =
  "places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.types,places.businessStatus,places.shortFormattedAddress";

function decodeDuckLink(href) {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href;
  } catch {
    return href;
  }
}

export function parseDuckResults(html) {
  const results = [];
  const blockRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>|)/gi;
  let match;
  while ((match = blockRe.exec(html))) {
    const href = decodeDuckLink(match[1].replace(/&amp;/g, "&"));
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    const snippet = (match[3] || "").replace(/<[^>]+>/g, "").trim();
    if (title && href) results.push({ title, href, snippet });
  }
  if (!results.length) {
    const alt =
      /<a[^>]*rel="nofollow"[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = alt.exec(html))) {
      results.push({
        title: match[2].replace(/<[^>]+>/g, "").trim(),
        href: decodeDuckLink(match[1].replace(/&amp;/g, "&")),
        snippet: "",
      });
    }
  }
  return results;
}

export async function duckSearch(query) {
  const body = new URLSearchParams({ q: query, kl: "uk-en" }).toString();
  const res = await fetchText("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://html.duckduckgo.com/",
    },
    body,
    timeoutMs: 15000,
  });
  if (!res.ok) return [];
  return parseDuckResults(res.text);
}

function looksLikeMapsHit(result) {
  const blob = `${result.href} ${result.title} ${result.snippet}`.toLowerCase();
  return (
    blob.includes("google.com/maps") ||
    blob.includes("maps.google") ||
    blob.includes("google.co.uk/maps") ||
    blob.includes("business.google") ||
    /\bgoogle maps\b/.test(blob)
  );
}

export async function checkGooglePresence(lead, town) {
  const query = `"${lead.name}" ${town || lead.postcode || ""}`;
  const results = await duckSearch(query);
  const maps = results.some(looksLikeMapsHit);
  const websiteHit = results
    .map((r) => r.href)
    .find((href) => isRealWebsite(href) && !/facebook|instagram|tiktok/i.test(href));
  if (maps && websiteHit) return { google: "complete", website: websiteHit };
  if (maps && !websiteHit) return { google: "blank", website: null };
  if (!maps && websiteHit) return { google: "none", website: websiteHit };
  return { google: maps ? "blank" : "none", website: null };
}

export async function enrichWithGoogleWeb(leads, town, onProgress, limit = 10) {
  const slice = leads.filter((lead) => !lead.hasWebsite).slice(0, limit);
  for (let i = 0; i < slice.length; i += 1) {
    const lead = slice[i];
    onProgress?.(`Checking Google for ${lead.name} (${i + 1}/${slice.length})`);
    try {
      const result = await checkGooglePresence(lead, town);
      lead.google = result.google;
      if (!lead.website && result.website) {
        lead.website = result.website;
        lead.hasWebsite = true;
      }
      lead.score = scoreLead(lead);
    } catch {
      lead.google = lead.google || "unknown";
    }
    await sleep(400);
  }
  return leads;
}

function leadFromGooglePlace(place, { town, postcode, lat, lon }) {
  const name = place.displayName?.text;
  if (!name || isChainName(name, chains())) return null;
  if (place.businessStatus && place.businessStatus !== "OPERATIONAL") return null;
  const presence = classifyOnlinePresence({}, place.websiteUri ? [place.websiteUri] : []);
  const urlCheck = presence.website ? assessWebsiteUrl(presence.website) : null;
  const google = presence.hasWebsite ? "complete" : "blank";
  return {
    id: `ggl-${name}-${place.formattedAddress || ""}`.slice(0, 80),
    name,
    category: (place.types || [])[0] || "business",
    address: place.formattedAddress || place.shortFormattedAddress || "",
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || null,
    email: null,
    postcode: postcode || "",
    lat: lat ?? null,
    lon: lon ?? null,
    source: "google",
    ...presence,
    websiteQuality: urlCheck?.quality || (presence.hasWebsite ? "ok" : "none"),
    websiteReasons: urlCheck?.reasons || [],
    google,
    mapsUrl: place.googleMapsUri,
    mapsSearch: place.googleMapsUri,
    googleSearch: `https://www.google.com/search?q=${encodeURIComponent(`"${name}" ${town || postcode}`)}`,
    instagramSearch: `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${name}" ${town || ""}`)}`,
    score: scoreLead({
      hasWebsite: presence.hasWebsite,
      hasBooking: presence.hasBooking,
      google,
      instagram: presence.instagram,
      websiteQuality: urlCheck?.quality,
    }),
  };
}

async function searchTextPlaces({ key, query, lat, lon, radius }) {
  const body = {
    textQuery: query,
    maxResultCount: 20,
  };
  if (lat != null && lon != null) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: Number(radius) || 10000,
      },
    };
  }
  const res = await fetchText("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
    body: JSON.stringify(body),
    timeoutMs: 20000,
  });
  if (!res.ok) return { ok: false, status: res.status, places: [] };
  try {
    const json = JSON.parse(res.text);
    return { ok: true, places: json.places || [] };
  } catch {
    return { ok: false, status: "parse", places: [] };
  }
}

export async function huntGooglePlaces({ lat, lon, radius, town, postcode, niche, mode = "city" }) {
  const key = googleKey();
  if (!key) {
    return { skipped: true, leads: [], reason: "no-key" };
  }

  const placeLabel = town || postcode || "here";
  const meters = Number(radius) || (mode === "city" ? 12000 : 1600);
  const seen = new Set();
  const leads = [];
  let lastError = "";

  const queries = googleTextQueriesFor(niche || "beauty", placeLabel);
  for (let i = 0; i < queries.length; i += 1) {
    const query = queries[i];
    const result = await searchTextPlaces({ key, query, lat, lon, radius: meters });
    if (!result.ok) {
      lastError = `places-${result.status}`;
      break;
    }
    for (const place of result.places) {
      const lead = leadFromGooglePlace(place, { town, postcode, lat, lon });
      if (!lead) continue;
      const keyName = `${lead.name.toLowerCase()}|${(lead.address || "").toLowerCase()}`;
      if (seen.has(keyName)) continue;
      seen.add(keyName);
      leads.push(lead);
    }
    if (i < queries.length - 1) await sleep(120);
  }

  if (!leads.length) {
    const types = googlePlaceTypesFor(niche);
    const res = await fetchText("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius: meters,
          },
        },
        includedTypes: types.slice(0, 10),
        maxResultCount: 20,
      }),
      timeoutMs: 20000,
    });
    if (res.ok) {
      try {
        const json = JSON.parse(res.text);
        for (const place of json.places || []) {
          const lead = leadFromGooglePlace(place, { town, postcode, lat, lon });
          if (!lead) continue;
          const keyName = `${lead.name.toLowerCase()}|${(lead.address || "").toLowerCase()}`;
          if (seen.has(keyName)) continue;
          seen.add(keyName);
          leads.push(lead);
        }
      } catch {
        lastError = lastError || "places-parse";
      }
    } else if (!leads.length) {
      return { skipped: false, leads: [], reason: lastError || `places-${res.status}` };
    }
  }

  return { skipped: false, leads, reason: lastError || null, queries };
}

export async function markOutdatedWebsites(leads, onProgress, limit = 18) {
  const candidates = leads.filter((lead) => lead.hasWebsite && lead.website).slice(0, limit);
  for (let i = 0; i < candidates.length; i += 1) {
    const lead = candidates[i];
    onProgress?.(`Checking if ${lead.name}'s website looks outdated (${i + 1}/${candidates.length})`);
    try {
      const verdict = await inspectWebsite(lead.website);
      lead.websiteQuality = verdict.quality;
      lead.websiteReasons = verdict.reasons;
      lead.score = scoreLead(lead);
    } catch {
      const fallback = assessWebsiteUrl(lead.website);
      lead.websiteQuality = fallback.quality;
      lead.websiteReasons = fallback.reasons;
      lead.score = scoreLead(lead);
    }
    await sleep(200);
  }
  return leads;
}

export async function huntInstagram({ town, postcode, niche }) {
  const place = town || postcode;
  const plans = instagramHuntPlans(place, niche || "all");
  const seen = new Set();
  const leads = [];

  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const results = await duckSearch(plan.query);
    for (const result of results) {
      const handle = instagramHandleFromUrl(result.href);
      if (!handle) continue;
      const key = handle.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (isChainName(handle, chains()) || isChainName(result.title, chains())) continue;
      const blob = `${handle} ${result.title} ${result.snippet}`;
      if (plan.match === "hair" && !looksLikeHairTrade(blob)) continue;
      const suggestsSite = snippetSuggestsWebsiteOrBooking(blob);
      const instagram = `https://instagram.com/${handle}`;
      leads.push({
        id: `ig-${key}`,
        name: result.title.replace(/\s*[•|·-]\s*Instagram.*$/i, "").trim() || handle,
        category: plan.label || "instagram",
        address: place,
        phone: null,
        email: null,
        postcode,
        lat: null,
        lon: null,
        source: "instagram",
        hasWebsite: suggestsSite,
        hasBooking: suggestsSite,
        hasSocial: true,
        website: null,
        booking: null,
        instagram,
        google: "unknown",
        score: suggestsSite ? "watch" : "warm",
        snippet: result.snippet,
        googleSearch: `https://www.google.com/search?q=${encodeURIComponent(`"${handle}" ${place} website OR booking`)}`,
        mapsSearch: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${result.title} ${place}`)}`,
        instagramSearch: instagram,
      });
    }
    if (i < plans.length - 1) await sleep(250);
  }

  return { query: plans[0]?.query || "", queries: plans, leads };
}
