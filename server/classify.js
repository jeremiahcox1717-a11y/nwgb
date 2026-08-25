const BOOKING_HOSTS = [
  "booksy",
  "fresha",
  "treatwell",
  "vagaro",
  "styleseat",
  "square.site",
  "squareup",
  "calendly",
  "acuityscheduling",
  "simplybook",
  "setmore",
  "mindbodyonline",
  "mindbody",
  "thefork",
  "opentable",
  "resy",
  "booksy.com",
  "shedul",
  "phorest",
  "salonized",
  "appointy",
  "jane.app",
  "cliniko",
  "healthengine",
  "zocdoc",
  "doctors.net",
  "timely",
  "schedulicity",
  "genbook",
  "book.tapsi",
  "bokadirekt",
];

const SOCIAL_HOSTS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "linktr.ee",
  "linktree",
  "bio.site",
  "beacons.ai",
  "later.com",
  "solo.to",
  "tap.bio",
  "allmylinks.com",
  "carrd.co",
];

const WEBSITE_TAG_KEYS = [
  "website",
  "contact:website",
  "url",
  "contact:url",
  "website:menu",
];

export function normalizePostcode(value) {
  if (!value) return "";
  return String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(.+)(\d[A-Z]{2})$/, (_, out, inn) => `${out} ${inn}`.trim());
}

export function compactPostcode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function outcodeFrom(value) {
  const compact = compactPostcode(value);
  if (!compact) return "";
  const full = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (full) return full[1];
  return compact;
}

export function looksLikeUrl(value) {
  if (!value) return false;
  const text = String(value).trim();
  return /^(https?:\/\/|www\.)/i.test(text) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
}

export function hostOf(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value).startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

export function isBookingUrl(value) {
  const host = hostOf(value);
  const raw = String(value || "").toLowerCase();
  return BOOKING_HOSTS.some((token) => host.includes(token) || raw.includes(token));
}

export function isSocialUrl(value) {
  const host = hostOf(value);
  const raw = String(value || "").toLowerCase();
  return SOCIAL_HOSTS.some((token) => host.includes(token) || raw.includes(token));
}

export function isRealWebsite(value) {
  if (!looksLikeUrl(value) && !/^https?:\/\//i.test(String(value || ""))) {
    if (!value) return false;
    if (!/\./.test(String(value))) return false;
  }
  if (!value) return false;
  return !isSocialUrl(value) && !isBookingUrl(value);
}

export function extractUrlsFromTags(tags = {}) {
  const found = [];
  for (const key of WEBSITE_TAG_KEYS) {
    if (tags[key]) found.push(String(tags[key]).trim());
  }
  if (tags["contact:instagram"]) {
    const handle = String(tags["contact:instagram"]).replace(/^@/, "");
    found.push(
      handle.includes("instagram.com") ? handle : `https://instagram.com/${handle}`,
    );
  }
  if (tags["contact:facebook"]) found.push(String(tags["contact:facebook"]));
  return found.filter(Boolean);
}

export function classifyOnlinePresence(tags = {}, extraUrls = []) {
  const urls = [...extractUrlsFromTags(tags), ...extraUrls].filter(Boolean);
  const websites = urls.filter(isRealWebsite);
  const bookings = urls.filter(isBookingUrl);
  const socials = urls.filter(isSocialUrl);
  const instagram =
    socials.find((u) => /instagram/i.test(u)) ||
    (tags["contact:instagram"]
      ? `https://instagram.com/${String(tags["contact:instagram"]).replace(/^@/, "")}`
      : null);

  return {
    hasWebsite: websites.length > 0,
    hasBooking: bookings.length > 0,
    hasSocial: socials.length > 0,
    website: websites[0] || null,
    booking: bookings[0] || null,
    instagram,
    urls,
  };
}

export function scoreLead({ hasWebsite, hasBooking, google, instagram }) {
  if (hasWebsite) return "skip";
  if (google === "none" && !hasBooking) return "hot";
  if (google === "blank" && !hasBooking) return "hot";
  if (instagram && !hasBooking) return "warm";
  if (!hasWebsite && !hasBooking) return "warm";
  return "watch";
}

export function isChainName(name, chainList) {
  const n = String(name || "").toLowerCase().replace(/['’]/g, "");
  if (!n) return false;
  return chainList.some((chain) => {
    const c = String(chain).toLowerCase().replace(/['’]/g, "");
    if (!c) return false;
    return n === c || n.startsWith(`${c} `) || n.includes(` ${c}`);
  });
}

export function instagramHandleFromUrl(url) {
  if (!url) return null;
  const match = String(url).match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (!match) return null;
  const handle = match[1];
  if (["p", "reel", "reels", "stories", "explore", "accounts", "tv", "direct"].includes(handle.toLowerCase())) {
    return null;
  }
  return handle;
}

export function snippetSuggestsWebsiteOrBooking(text) {
  const raw = String(text || "").toLowerCase();
  if (!raw) return false;
  if (/(booksy|fresha|treatwell|vagaro|calendly|linktr\.ee|www\.|https?:\/\/)/i.test(raw)) return true;
  if (/\b(book now|booking|book online|website)\b/i.test(raw)) return true;
  return false;
}

export function categoryFromTags(tags = {}) {
  return (
    tags.shop ||
    tags.craft ||
    tags.amenity ||
    tags.office ||
    tags.tourism ||
    tags.leisure ||
    tags.healthcare ||
    "business"
  );
}
