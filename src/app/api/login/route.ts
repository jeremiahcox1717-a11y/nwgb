import { NextResponse } from "next/server";
import {
  cookieSettings,
  getAccessPassword,
  passwordsMatch,
  SESSION_COOKIE,
  signSession,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const password = getAccessPassword();
  if (!password) {
    return NextResponse.json(
      {
        error:
          "Set ACCESS_PASSWORD in your environment before anyone can sign in.",
      },
      { status: 500 },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limited = rateLimit(`login:${ip}`, 8, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes." },
      { status: 429 },
    );
  }

  let submitted = "";
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { password?: string };
    submitted = body.password ?? "";
  } else {
    const form = await request.formData();
    submitted = String(form.get("password") ?? "");
  }

  if (!passwordsMatch(submitted, password)) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await signSession(), cookieSettings());
  return response;
}
