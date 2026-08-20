import { NextResponse } from "next/server";
import { getAccessPassword } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    passwordSet: Boolean(getAccessPassword()),
    mapsKeySet: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
  });
}
