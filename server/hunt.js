import { geocodePlace, geocodePostcode } from "./geocode.js";
import { markGiven } from "./postcodes.js";
import { huntOsm } from "./hunt-osm.js";
import {
  enrichWithGoogleWeb,
  fillMissingPhones,
  huntGooglePlaces,
  huntInstagram,
  markOutdatedWebsites,
} from "./hunt-google.js";
import { scoreLead } from "./classify.js";
import { assessWebsiteUrl } from "./website-quality.js";
import { instagramSearchLinks } from "./niches.js";

function emit(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function keepLead(lead, modes) {
  const wantIg = modes.includes("instagram");
  const wantNoSite = modes.includes("noWebsite");
  const wantGhost = modes.includes("noGoogle");
  const wantBlank = modes.includes("onGoogleNoWebsite");
  const wantOutdated = modes.includes("outdatedWebsite");
  const outdated = lead.websiteQuality === "outdated";

  if (lead.source === "instagram") {
    return wantIg && !lead.hasWebsite && !lead.hasBooking;
  }
  if (lead.hasWebsite) {
    return wantOutdated && outdated;
  }
  if (wantIg && lead.instagram && !lead.hasBooking) return true;
  if (wantGhost && lead.google === "none") return true;
  if (wantBlank && (lead.google === "blank" || lead.source === "google")) return true;
  if (wantNoSite) return true;
  return false;
}

function defaultModes() {
  return ["noWebsite", "onGoogleNoWebsite", "outdatedWebsite", "instagram"];
}

export async function runHunt({
  place,
  city,
  postcode,
  country,
  language,
  modes,
  niche,
  radius,
  onEvent,
}) {
  const target = String(place || city || postcode || "").trim();
  if (!target) {
    onEvent("fail", { message: "Need a city to hunt." });
    return { ok: false, error: "Need a city to hunt." };
  }

  const isPostcodeOnly = Boolean(postcode) && !place && !city;
  const geo = isPostcodeOnly
    ? await geocodePostcode(postcode)
    : await geocodePlace(target, { country, language });

  if (!geo.ok) {
    onEvent("fail", { message: geo.error });
    return { ok: false, error: geo.error };
  }

  // Only burn postcodes when the hunt was aimed at a postcode ticket.
  if (geo.kind === "postcode" && (geo.postcode || postcode)) {
    markGiven(geo.postcode || postcode, {
      hunt: true,
      country: geo.country,
      town: geo.town,
      region: geo.region,
      nation: geo.nation,
      lat: geo.lat,
      lon: geo.lon,
    });
  }

  onEvent("geo", geo);
  const cityMode = geo.kind === "city" || Boolean(place || city);
  const meters = Number(radius) || (cityMode ? 12000 : 1600);
  const selected = modes?.length ? modes : defaultModes();
  const all = [];
  const label = geo.town || geo.display || target;

  onEvent("status", {
    message: `Searching Google Maps businesses in ${label}…`,
  });
  const places = await huntGooglePlaces({
    lat: geo.lat,
    lon: geo.lon,
    radius: meters,
    town: geo.town || label,
    postcode: geo.postcode || "",
    niche: niche || "beauty",
    mode: cityMode ? "city" : "postcode",
  });

  if (places.skipped) {
    onEvent("status", {
      message:
        "No Google API key — sweeping OpenStreetMap and checking the public web for Maps listings. Add GOOGLE_PLACES_API_KEY for a proper Google Maps city sweep.",
    });
  } else {
    all.push(...places.leads);
    onEvent("status", {
      message: `Google Maps returned ${places.leads.length} businesses in ${label}.`,
    });
  }

  onEvent("status", { message: `Sweeping OpenStreetMap around ${label}…` });
  try {
    const osm = await huntOsm({
      lat: geo.lat,
      lon: geo.lon,
      radius: meters,
      town: geo.town || label,
      postcode: geo.postcode || "",
      niche: niche || "all",
    });
    all.push(...osm);
    onEvent("status", { message: `Found ${osm.length} local businesses on OpenStreetMap.` });
  } catch (err) {
    onEvent("status", {
      message: `OpenStreetMap sweep failed: ${err.message}. Still trying the other nets.`,
    });
  }

  if (places.skipped && (selected.includes("onGoogleNoWebsite") || selected.includes("noGoogle"))) {
    await enrichWithGoogleWeb(all, geo.town || label, (message) => onEvent("status", { message }));
  }

  if (selected.includes("outdatedWebsite")) {
    for (const lead of all) {
      if (!lead.hasWebsite || !lead.website) continue;
      if (lead.websiteQuality) continue;
      const quick = assessWebsiteUrl(lead.website);
      lead.websiteQuality = quick.quality;
      lead.websiteReasons = quick.reasons;
    }
    onEvent("status", { message: "Checking websites that look old or broken…" });
    await markOutdatedWebsites(all, (message) => onEvent("status", { message }));
  }

  if (selected.includes("instagram")) {
    onEvent("status", {
      message: `Hunting Instagram shops in ${geo.town || label} with no site / no booking…`,
    });
    try {
      const ig = await huntInstagram({
        town: geo.town || label,
        postcode: geo.postcode || "",
        niche: niche || "beauty",
      });
      all.push(...ig.leads);
      const searches = instagramSearchLinks(ig.queries || [{ label: "Instagram", query: ig.query }]);
      onEvent("instagramQuery", {
        query: ig.query,
        queries: ig.queries,
        searches,
        googleUrl: searches[0]?.googleUrl,
        bingUrl: searches[0]?.bingUrl,
      });
      onEvent("status", {
        message: ig.leads.length
          ? `Instagram net pulled ${ig.leads.length} handles.`
          : "Instagram search from this machine came back empty (search engines often hide that). Use the Google/Bing Instagram links under the hunt — that's the reliable way to pick shops with no site and no booking.",
      });
    } catch (err) {
      onEvent("status", {
        message: `Instagram search was blocked or empty (${err.message}). Use the search links on each card.`,
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const lead of all) {
    lead.score = scoreLead(lead);
    const key = `${(lead.name || "").toLowerCase()}|${lead.source}|${(lead.instagram || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (lead.score === "skip") continue;
    if (!keepLead(lead, selected)) continue;
    unique.push(lead);
  }

  unique.sort((a, b) => {
    const order = { hot: 0, warm: 1, watch: 2 };
    return (order[a.score] ?? 9) - (order[b.score] ?? 9) || a.name.localeCompare(b.name);
  });

  const needingPhone = unique.filter((lead) => !lead.phone).length;
  if (needingPhone) {
    onEvent("status", {
      message: `Checking public listings for phone numbers (${needingPhone} without one)…`,
    });
    await fillMissingPhones(unique, geo.town || label, (message) => onEvent("status", { message }));
  }
  const withPhone = unique.filter((lead) => lead.phone).length;
  if (withPhone) {
    onEvent("status", {
      message: `${withPhone} of ${unique.length} leads have a public phone number.`,
    });
  }

  const summary = {
    hot: unique.filter((l) => l.score === "hot").length,
    warm: unique.filter((l) => l.score === "warm").length,
    watch: unique.filter((l) => l.score === "watch").length,
  };

  onEvent("done", { geo, leads: unique, summary });
  return { ok: true, geo, leads: unique, summary };
}

export async function huntSse(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const url = new URL(req.url, "http://localhost");
  const place = url.searchParams.get("place") || url.searchParams.get("city") || "";
  const postcode = url.searchParams.get("postcode") || "";
  const country = url.searchParams.get("country") || "";
  const language = url.searchParams.get("language") || "";
  const modes = (url.searchParams.get("modes") || "").split(",").filter(Boolean);
  const niche = url.searchParams.get("niche") || "beauty";
  const radius = url.searchParams.get("radius") || "";
  try {
    await runHunt({
      place,
      postcode,
      country,
      language,
      modes,
      niche,
      radius,
      onEvent: (event, data) => emit(res, event, data),
    });
  } catch (err) {
    emit(res, "fail", { message: err.message || "Hunt failed." });
  }
  res.end();
}
