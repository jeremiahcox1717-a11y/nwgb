export type WebsiteKind = "none" | "social" | "website";

const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "yelp.com",
  "tiktok.com",
  "linktr.ee",
  "linktree.com",
  "youtube.com",
  "youtu.be",
  "pinterest.com",
  "threads.net",
  "wa.me",
  "whatsapp.com",
  "m.me",
  "messenger.com",
  "snapchat.com",
];

const GOOGLE_PROFILE_HOSTS = [
  "maps.google.com",
  "goo.gl",
  "g.page",
  "business.google.com",
  "maps.app.goo.gl",
];

function hostnameOf(uri: string): string | null {
  try {
    return new URL(uri).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matchesHost(host: string, listed: string): boolean {
  return host === listed || host.endsWith(`.${listed}`);
}

export function websiteKind(uri?: string | null): WebsiteKind {
  const value = uri?.trim();
  if (!value) return "none";

  const host = hostnameOf(value);
  if (!host) return "none";

  if (SOCIAL_HOSTS.some((item) => matchesHost(host, item))) {
    return "social";
  }

  if (GOOGLE_PROFILE_HOSTS.some((item) => matchesHost(host, item))) {
    return "none";
  }

  return "website";
}

export function isNoWebsiteLead(
  uri: string | null | undefined,
  treatSocialAsNoWebsite: boolean,
): boolean {
  const kind = websiteKind(uri);
  if (kind === "none") return true;
  return treatSocialAsNoWebsite && kind === "social";
}

export function websiteLabel(kind: WebsiteKind): string {
  if (kind === "none") return "No website";
  if (kind === "social") return "Social only";
  return "Has website";
}
