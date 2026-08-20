import { NextResponse } from "next/server";
import { CATEGORIES, getCategory } from "@/lib/categories";
import {
  geocodeLocation,
  searchAllPages,
  selectLeads,
  type GeocodedLocation,
  type PlaceHit,
} from "@/lib/places";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type SearchBody = {
  location?: string;
  category?: string;
  treatSocialAsNoWebsite?: boolean;
};

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Add GOOGLE_MAPS_API_KEY, enable Places API (New) and Geocoding API, then restart the app.",
      },
      { status: 503 },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limited = rateLimit(`search:${ip}`, 30, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Search limit reached for this hour. Try again later." },
      { status: 429 },
    );
  }

  let body: SearchBody;
  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "Invalid search request." }, { status: 400 });
  }

  const location = body.location?.trim() ?? "";
  if (location.length < 2) {
    return NextResponse.json(
      { error: "Enter a city or a postal code." },
      { status: 400 },
    );
  }

  const treatSocialAsNoWebsite = body.treatSocialAsNoWebsite !== false;
  const categoryId = body.category?.trim() || "quick";

  try {
    const geo = await geocodeLocation(location, apiKey);
    const { textQuery, includedType, label } = queryFor(categoryId, location, geo);
    const places = await searchAllPages({
      apiKey,
      textQuery,
      includedType,
      geo,
      maxPages: 3,
    });
    const leads: PlaceHit[] = selectLeads(places, treatSocialAsNoWebsite);

    return NextResponse.json({
      locationLabel: geo.label,
      category: label,
      scanned: places.length,
      leads,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function queryFor(
  categoryId: string,
  location: string,
  geo: GeocodedLocation,
): { textQuery: string; includedType?: string; label: string } {
  if (categoryId === "quick") {
    return {
      textQuery: `businesses in ${geo.label || location}`,
      label: "Businesses",
    };
  }

  const category = getCategory(categoryId);
  if (!category) {
    const known = CATEGORIES.map((item) => item.id).join(", ");
    throw new Error(`Unknown category. Use quick or one of: ${known}`);
  }

  return {
    textQuery: `${category.query} in ${geo.label || location}`,
    includedType: category.googleType,
    label: category.label,
  };
}
