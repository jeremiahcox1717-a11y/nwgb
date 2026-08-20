import { isNoWebsiteLead, websiteKind, type WebsiteKind } from "./websites";

export type GeoPoint = { lat: number; lng: number };

export type GeoViewport = {
  northeast: GeoPoint;
  southwest: GeoPoint;
};

export type GeocodedLocation = {
  label: string;
  location: GeoPoint;
  viewport: GeoViewport;
  placeTypes: string[];
};

export type PlaceHit = {
  id: string;
  name: string;
  address: string;
  phone: string;
  website: string | null;
  websiteKind: WebsiteKind;
  mapsUrl: string;
  rating: number | null;
  reviewCount: number | null;
  primaryType: string;
  status: string;
};

export type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  businessStatus?: string;
};

type GeocodeResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    types?: string[];
    geometry?: {
      location?: { lat: number; lng: number };
      viewport?: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
      };
    };
  }>;
};

type PlacesSearchResponse = {
  places?: GooglePlace[];
  nextPageToken?: string;
  error?: { code?: number; message?: string; status?: string };
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",");

const TOO_BROAD = new Set([
  "country",
  "administrative_area_level_1",
  "continent",
  "political",
]);

export function locationIsTooBroad(types: string[]): boolean {
  const meaningful = types.filter((type) => type !== "political");
  if (meaningful.length === 0) return true;
  return meaningful.every((type) => TOO_BROAD.has(type));
}

export function mapsUrlFor(place: GooglePlace): string {
  if (place.googleMapsUri) return place.googleMapsUri;
  if (place.id) return `https://www.google.com/maps/place/?q=place_id:${place.id}`;
  return "";
}

export function toPlaceHit(place: GooglePlace): PlaceHit | null {
  const id = place.id?.trim();
  const name = place.displayName?.text?.trim();
  if (!id || !name) return null;
  if (place.businessStatus === "CLOSED_PERMANENTLY") return null;

  const website = place.websiteUri?.trim() || null;
  return {
    id,
    name,
    address: place.formattedAddress?.trim() || "",
    phone:
      place.nationalPhoneNumber?.trim() ||
      place.internationalPhoneNumber?.trim() ||
      "",
    website,
    websiteKind: websiteKind(website),
    mapsUrl: mapsUrlFor(place),
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount:
      typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    primaryType:
      place.primaryTypeDisplayName?.text?.trim() ||
      place.primaryType?.replace(/_/g, " ") ||
      "",
    status: place.businessStatus || "OPERATIONAL",
  };
}

export function selectLeads(
  places: GooglePlace[],
  treatSocialAsNoWebsite: boolean,
): PlaceHit[] {
  const hits: PlaceHit[] = [];
  const seen = new Set<string>();

  for (const place of places) {
    const hit = toPlaceHit(place);
    if (!hit || seen.has(hit.id)) continue;
    seen.add(hit.id);
    if (!isNoWebsiteLead(hit.website, treatSocialAsNoWebsite)) continue;
    hits.push(hit);
  }

  return hits;
}

export async function geocodeLocation(
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodedLocation> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);

  const response = await fetchImpl(url);
  const data = (await response.json()) as GeocodeResponse;

  if (data.status !== "OK" || !data.results?.[0]) {
    const extra = data.error_message ? ` ${data.error_message}` : "";
    throw new Error(humanGeocodeError(data.status) + extra);
  }

  const result = data.results[0];
  const location = result.geometry?.location;
  const viewport = result.geometry?.viewport;
  if (!location || !viewport) {
    throw new Error("Google did not return a usable map area for that place.");
  }

  const placeTypes = result.types ?? [];
  if (locationIsTooBroad(placeTypes)) {
    throw new Error(
      "That looks like a whole country or state. Use a city or a postal code instead.",
    );
  }

  return {
    label: result.formatted_address || query,
    location: { lat: location.lat, lng: location.lng },
    viewport: {
      northeast: {
        lat: viewport.northeast.lat,
        lng: viewport.northeast.lng,
      },
      southwest: {
        lat: viewport.southwest.lat,
        lng: viewport.southwest.lng,
      },
    },
    placeTypes,
  };
}

function humanGeocodeError(status: string): string {
  if (status === "ZERO_RESULTS") {
    return "No city or postal code matched that search.";
  }
  if (status === "OVER_QUERY_LIMIT" || status === "RESOURCE_EXHAUSTED") {
    return "Google geocoding quota is used up for now.";
  }
  if (status === "REQUEST_DENIED") {
    return "Google rejected the geocoding key. Enable Geocoding API and check key restrictions.";
  }
  if (status === "INVALID_REQUEST") {
    return "That city or postal code could not be read.";
  }
  return "Could not look up that city or postal code.";
}

export function locationBiasFor(geo: GeocodedLocation) {
  return {
    rectangle: {
      low: {
        latitude: geo.viewport.southwest.lat,
        longitude: geo.viewport.southwest.lng,
      },
      high: {
        latitude: geo.viewport.northeast.lat,
        longitude: geo.viewport.northeast.lng,
      },
    },
  };
}

type SearchTextArgs = {
  apiKey: string;
  textQuery: string;
  includedType?: string;
  geo: GeocodedLocation;
  pageToken?: string;
  fetchImpl?: typeof fetch;
};

export async function searchTextPage({
  apiKey,
  textQuery,
  includedType,
  geo,
  pageToken,
  fetchImpl = fetch,
}: SearchTextArgs): Promise<{ places: GooglePlace[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = pageToken
    ? { textQuery, pageSize: 20, pageToken }
    : {
        textQuery,
        pageSize: 20,
        languageCode: "en",
        includePureServiceAreaBusinesses: true,
        locationBias: locationBiasFor(geo),
      };

  if (!pageToken && includedType) {
    body.includedType = includedType;
  }

  const response = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as PlacesSearchResponse;
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Places search failed (${response.status}).`);
  }

  return {
    places: data.places ?? [],
    nextPageToken: data.nextPageToken,
  };
}

export async function searchAllPages(args: SearchTextArgs & { maxPages?: number }) {
  const maxPages = args.maxPages ?? 3;
  const collected: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await searchTextPage({ ...args, pageToken });
    collected.push(...result.places);
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }

  return collected;
}

export function toCsv(rows: PlaceHit[]): string {
  const header = [
    "Name",
    "Phone",
    "Address",
    "Category",
    "Rating",
    "Reviews",
    "Website status",
    "Website",
    "Google Maps",
  ];

  const lines = [header, ...rows.map((row) => [
    row.name,
    row.phone,
    row.address,
    row.primaryType,
    row.rating == null ? "" : String(row.rating),
    row.reviewCount == null ? "" : String(row.reviewCount),
    row.websiteKind === "none" ? "No website" : row.websiteKind === "social" ? "Social only" : "Has website",
    row.website ?? "",
    row.mapsUrl,
  ])];

  return lines.map((cols) => cols.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
