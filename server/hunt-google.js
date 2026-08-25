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
  instagramHuntPlans,
  looksLikeHairTrade,
} from "./niches.js";

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

export async function huntGooglePlaces({ lat, lon, radius, town, postcode, niche }) {
  const key = googleKey();
  if (!key) {
    return { skipped: true, leads: [], reason: "no-key" };
  }

  const res = await fetchText("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.types,places.businessStatus,places.shortFormattedAddress",
    },
    body: JSON.stringify({
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: Number(radius) || 1600,
        },
      },
      includedTypes: googlePlaceTypesFor(niche),
      maxResultCount: 20,
    }),
    timeoutMs: 20000,
  });

  if (!res.ok) {
    return { skipped: false, leads: [], reason: `places-${res.status}` };
  }

  let json;
  try {
    json = JSON.parse(res.text);
  } catch {
    return { skipped: false, leads: [], reason: "places-parse" };
  }

  const leads = [];
  for (const place of json.places || []) {
    const name = place.displayName?.text;
    if (!name || isChainName(name, chains())) continue;
    const presence = classifyOnlinePresence({}, place.websiteUri ? [place.websiteUri] : []);
    const google = presence.hasWebsite ? "complete" : "blank";
    leads.push({
      id: `ggl-${name}-${place.formattedAddress || ""}`.slice(0, 80),
      name,
      category: (place.types || [])[0] || "business",
      address: place.formattedAddress || place.shortFormattedAddress || "",
      phone: place.nationalPhoneNumber || null,
      email: null,
      postcode,
      lat,
      lon,
      source: "google",
      ...presence,
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
      }),
    });
  }

  return { skipped: false, leads };
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
