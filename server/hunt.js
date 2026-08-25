import { geocodePostcode } from "./geocode.js";
import { markGiven } from "./postcodes.js";
import { huntOsm } from "./hunt-osm.js";
import {
  enrichWithGoogleWeb,
  huntGooglePlaces,
  huntInstagram,
} from "./hunt-google.js";
import { scoreLead } from "./classify.js";

function emit(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function keepLead(lead, modes) {
  const wantIg = modes.includes("instagram");
  const wantNoSite = modes.includes("noWebsite");
  const wantGhost = modes.includes("noGoogle");
  const wantBlank = modes.includes("onGoogleNoWebsite");

  if (lead.source === "instagram") {
    return wantIg && !lead.hasWebsite && !lead.hasBooking;
  }
  if (lead.hasWebsite) return false;
  if (wantIg && lead.instagram && !lead.hasBooking) return true;
  if (wantGhost && lead.google === "none") return true;
  if (wantBlank && (lead.google === "blank" || lead.source === "google")) return true;
  if (wantNoSite) return true;
  return false;
}

export async function runHunt({ postcode, modes, niche, radius, onEvent = () => {} }) {
  const geo = await geocodePostcode(postcode);
  if (!geo.ok) {
    onEvent("fail", { message: geo.error });
    return { ok: false, error: geo.error };
  }

  markGiven(geo.postcode || postcode, {
    hunt: true,
    country: geo.country,
    town: geo.town,
    region: geo.region,
    nation: geo.nation,
    lat: geo.lat,
    lon: geo.lon,
  });

  onEvent("geo", geo);
  const meters = Number(radius) || 1600;
  const selected = modes?.length ? modes : ["noWebsite", "noGoogle", "onGoogleNoWebsite", "instagram"];
  const all = [];

  onEvent("status", { message: `Sweeping OpenStreetMap around ${geo.postcode || postcode}…` });
  try {
    const osm = await huntOsm({
      lat: geo.lat,
      lon: geo.lon,
      radius: meters,
      town: geo.town,
      postcode: geo.postcode || postcode,
      niche: niche || "all",
    });
    all.push(...osm);
    onEvent("status", { message: `Found ${osm.length} local businesses on OpenStreetMap.` });
  } catch (err) {
    onEvent("status", { message: `OpenStreetMap sweep failed: ${err.message}. Still trying the other nets.` });
  }

  if (selected.includes("onGoogleNoWebsite") || selected.includes("noGoogle")) {
    onEvent("status", { message: "Asking Google Places for listings with no website…" });
    const places = await huntGooglePlaces({
      lat: geo.lat,
      lon: geo.lon,
      radius: meters,
      town: geo.town,
      postcode: geo.postcode || postcode,
    });
    if (places.skipped) {
      onEvent("status", {
        message:
          "No Google API key — I'll check the OpenStreetMap names against the public web instead. Add GOOGLE_PLACES_API_KEY for a proper Maps sweep.",
      });
      await enrichWithGoogleWeb(all, geo.town, (message) => onEvent("status", { message }));
    } else {
      all.push(...places.leads);
      onEvent("status", { message: `Google Places returned ${places.leads.length} listings.` });
    }
  }

  if (selected.includes("instagram")) {
    onEvent("status", { message: `Hunting Instagram shops in ${geo.town || postcode} with no site / no booking…` });
    try {
      const ig = await huntInstagram({
        town: geo.town,
        postcode: geo.postcode || postcode,
        niche: niche || "all",
      });
      all.push(...ig.leads);
      onEvent("instagramQuery", {
        query: ig.query,
        googleUrl: `https://www.google.com/search?q=${encodeURIComponent(ig.query)}`,
        bingUrl: `https://www.bing.com/search?q=${encodeURIComponent(ig.query)}`,
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
  const postcode = url.searchParams.get("postcode") || "";
  const modes = (url.searchParams.get("modes") || "").split(",").filter(Boolean);
  const niche = url.searchParams.get("niche") || "all";
  const radius = url.searchParams.get("radius") || "1600";
  try {
    await runHunt({
      postcode,
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
