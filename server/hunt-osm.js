import { fetchText } from "./http.js";
import {
  categoryFromTags,
  classifyOnlinePresence,
  isChainName,
  scoreLead,
} from "./classify.js";
import { dataFile } from "./data-files.js";
import { OSM_NICHE_REGEX } from "./niches.js";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function overpassQuery(lat, lon, radius, niche) {
  const around = `(around:${radius},${lat},${lon})`;
  if (niche && niche !== "all" && OSM_NICHE_REGEX[niche]) {
    return `
[out:json][timeout:28];
(
  nwr[~"^(shop|craft|amenity|office|leisure|tourism)$"~"${OSM_NICHE_REGEX[niche]}"]${around};
);
out tags center 120;
`.trim();
  }
  return `
[out:json][timeout:28];
(
  nwr["shop"]${around};
  nwr["craft"]${around};
  nwr["amenity"~"restaurant|cafe|bar|pub|fast_food|pharmacy|dentist|doctors|clinic|veterinary"]${around};
  nwr["office"]${around};
  nwr["tourism"~"hotel|guest_house|hostel|apartment"]${around};
  nwr["leisure"~"fitness_centre|sports_centre|sauna"]${around};
  nwr["contact:instagram"]${around};
);
out tags center 120;
`.trim();
}

async function runOverpass(query) {
  let lastError = "Overpass did not answer.";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchText(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
        timeoutMs: 32000,
      });
      if (!res.ok) {
        lastError = `Overpass ${res.status}`;
        continue;
      }
      const json = JSON.parse(res.text);
      return json;
    } catch (err) {
      lastError = err.message || String(err);
    }
  }
  throw new Error(lastError);
}

function pointOf(el) {
  if (el.lat && el.lon) return { lat: el.lat, lon: el.lon };
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return { lat: null, lon: null };
}

export async function huntOsm({ lat, lon, radius, town, postcode, niche }) {
  const json = await runOverpass(overpassQuery(lat, lon, radius, niche));
  const elements = Array.isArray(json.elements) ? json.elements : [];
  const seen = new Set();
  const leads = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags["name:en"] || tags.operator;
    if (!name) continue;
    if (isChainName(name, dataFile("chains.json"))) continue;
    if (categoryFromTags(tags) === "yes") continue;
    const key = `${name.toLowerCase()}|${tags["addr:street"] || ""}|${tags["addr:housenumber"] || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const presence = classifyOnlinePresence(tags);
    const point = pointOf(el);
    const address = [
      tags["addr:housenumber"],
      tags["addr:street"],
      tags["addr:place"],
      tags["addr:suburb"],
      tags["addr:city"] || town,
      tags["addr:postcode"] || postcode,
    ]
      .filter(Boolean)
      .join(", ");

    const googleHint =
      tags["brand:wikidata"] || tags.brand ? "complete" : "unknown";

    leads.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      category: categoryFromTags(tags),
      address,
      phone: tags.phone || tags["contact:phone"] || tags["contact:mobile"] || null,
      email: tags.email || tags["contact:email"] || null,
      postcode: tags["addr:postcode"] || postcode,
      lat: point.lat,
      lon: point.lon,
      source: "osm",
      ...presence,
      google: googleHint,
      score: scoreLead({
        hasWebsite: presence.hasWebsite,
        hasBooking: presence.hasBooking,
        google: googleHint,
        instagram: presence.instagram,
      }),
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      mapsSearch: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address || town || postcode}`)}`,
      googleSearch: `https://www.google.com/search?q=${encodeURIComponent(`"${name}" ${town || postcode}`)}`,
      instagramSearch: `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${name}" ${town || ""}`)}`,
    });
  }

  return leads;
}
