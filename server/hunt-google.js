import { fetchText, sleep } from "./http.js";
import {
  classifyOnlinePresence,
  instagramHandleFromUrl,
  isChainName,
  isRealWebsite,
  scoreLead,
  snippetSuggestsWebsiteOrBooking,
} from "./classify.js";
import { extractPublicPhone, normalizePhone, phonesFromHtml, sharePhonesByName } from "./phone.js";
import {
  googlePlaceTypesFor,
  instagramHuntPlans,
  looksLikeHairTrade,
} from "./niches.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHAINS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "chains.json"), "utf8"),
);

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
  const searchHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    Referer: "https://html.duckduckgo.com/",
  };
  const attempts = [
    () =>
      fetchText(`https://html.duckduckgo.com/html/?kl=uk-en&q=${encodeURIComponent(query)}`, {
        headers: searchHeaders,
        timeoutMs: 15000,
      }),
    () =>
      fetchText("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: {
          ...searchHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ q: query, kl: "uk-en" }).toString(),
        timeoutMs: 15000,
      }),
  ];
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) continue;
      const results = parseDuckResults(res.text);
      if (results.length) return results;
    } catch {
      // try the other request shape
    }
  }
  return [];
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

export function phoneFromSearchResults(results) {
  const blob = (results || [])
    .map((row) => `${row.title || ""} ${row.snippet || ""}`)
    .join(" ");
  return extractPublicPhone(blob);
}

export async function checkGooglePresence(lead, town) {
  const query = `"${lead.name}" ${town || lead.postcode || ""}`;
  const results = await duckSearch(query);
  const maps = results.some(looksLikeMapsHit);
  const websiteHit = results
    .map((r) => r.href)
    .find((href) => isRealWebsite(href) && !/facebook|instagram|tiktok/i.test(href));
  const phone = phoneFromSearchResults(results);
  if (maps && websiteHit) return { google: "complete", website: websiteHit, phone };
  if (maps && !websiteHit) return { google: "blank", website: null, phone };
  if (!maps && websiteHit) return { google: "none", website: websiteHit, phone };
  return { google: maps ? "blank" : "none", website: null, phone };
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
      if (!lead.phone && result.phone) lead.phone = result.phone;
      lead.score = scoreLead(lead);
    } catch {
      lead.google = lead.google || "unknown";
    }
    await sleep(400);
  }
  return leads;
}

export async function lookupPublicPhone(lead, town) {
  const place = town || lead.postcode || "";
  const results = await duckSearch(`"${lead.name}" ${place} (phone OR tel OR telephone)`);
  if (!results.length) return { phone: null, searched: false };

  const fromSnippets = phoneFromSearchResults(results);
  if (fromSnippets) return { phone: fromSnippets, searched: true };

  const skipHost = /google\.|gstatic\.|facebook\.|instagram\.|tiktok\.|youtube\.|duckduckgo\.|bing\.com|x\.com|twitter\./i;
  const pages = (results || [])
    .map((row) => row.href)
    .filter((href) => href && /^https?:/i.test(href) && !skipHost.test(href))
    .slice(0, 2);

  for (const href of pages) {
    try {
      const res = await fetchText(href, {
        timeoutMs: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) continue;
      const phone = phonesFromHtml(res.text);
      if (phone) return { phone, searched: true };
    } catch {
      // Try the next public page.
    }
  }
  return { phone: null, searched: true };
}

export async function fillMissingPhones(leads, town, onProgress) {
  sharePhonesByName(leads);
  const missing = leads.filter((lead) => !lead.phone);
  let emptyEngine = 0;
  for (let i = 0; i < missing.length; i += 1) {
    const lead = missing[i];
    onProgress?.(`Looking up a public phone for ${lead.name} (${i + 1}/${missing.length})`);
    try {
      const { phone, searched } = await lookupPublicPhone(lead, town);
      if (phone) {
        lead.phone = phone;
        emptyEngine = 0;
      } else if (!searched) {
        emptyEngine += 1;
      } else {
        emptyEngine = 0;
      }
    } catch {
      emptyEngine += 1;
    }
    if (emptyEngine >= 4) {
      onProgress?.(
        "Public web search is not answering from this machine. Showing numbers already listed on the map.",
      );
      break;
    }
    await sleep(250);
  }
  sharePhonesByName(leads);
  return leads;
}

export async function huntGooglePlaces({ lat, lon, radius, town, postcode, niche }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return { skipped: true, leads: [], reason: "no-key" };
  }

  const res = await fetchText("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.types,places.businessStatus,places.shortFormattedAddress",
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
    if (!name || isChainName(name, CHAINS)) continue;
    const presence = classifyOnlinePresence({}, place.websiteUri ? [place.websiteUri] : []);
    const google = presence.hasWebsite ? "complete" : "blank";
    leads.push({
      id: `ggl-${name}-${place.formattedAddress || ""}`.slice(0, 80),
      name,
      category: (place.types || [])[0] || "business",
      address: place.formattedAddress || place.shortFormattedAddress || "",
      phone:
        normalizePhone(place.nationalPhoneNumber) ||
        normalizePhone(place.internationalPhoneNumber) ||
        null,
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
      if (isChainName(handle, CHAINS) || isChainName(result.title, CHAINS)) continue;
      const blob = `${handle} ${result.title} ${result.snippet}`;
      if (plan.match === "hair" && !looksLikeHairTrade(blob)) continue;
      const suggestsSite = snippetSuggestsWebsiteOrBooking(blob);
      const instagram = `https://instagram.com/${handle}`;
      leads.push({
        id: `ig-${key}`,
        name: result.title.replace(/\s*[•|·-]\s*Instagram.*$/i, "").trim() || handle,
        category: plan.label || "instagram",
        address: place,
        phone: extractPublicPhone(`${result.title} ${result.snippet}`),
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
