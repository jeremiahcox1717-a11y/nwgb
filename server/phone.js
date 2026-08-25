const UK_CANDIDATE =
  /(?:\+44\s?\(?0?\)?[\s.-]?|00\s?44[\s.-]?|0)(?:\d[\s().-]?){8,10}\d/g;
const US_CANDIDATE =
  /(?:\+1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g;

const OSM_PHONE_KEYS = [
  "phone",
  "contact:phone",
  "contact:mobile",
  "mobile",
  "contact:whatsapp",
  "phone:mobile",
  "contact:phone:mobile",
];

export function digitsOf(value) {
  return String(value || "").replace(/\D/g, "");
}

export function isPlausiblePublicPhone(value) {
  const digits = digitsOf(value);
  if (digits.startsWith("44") && digits.length >= 11 && digits.length <= 13) return true;
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 11) return true;
  if (digits.startsWith("1") && digits.length === 11) return true;
  if (digits.length === 10 || digits.length === 11) return true;
  return false;
}

export function normalizePhone(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!isPlausiblePublicPhone(raw)) return null;
  return raw.replace(/\s+/g, " ").trim();
}

function uniqueCandidates(text) {
  const blob = String(text || "");
  const found = [];
  for (const re of [UK_CANDIDATE, US_CANDIDATE]) {
    re.lastIndex = 0;
    const matches = blob.match(re) || [];
    found.push(...matches);
  }
  return found;
}

export function extractPublicPhone(text) {
  if (!text) return null;
  const blob = String(text);
  const ranked = uniqueCandidates(blob)
    .map((match) => match.trim())
    .filter(isPlausiblePublicPhone)
    .sort((a, b) => {
      const aUk = /(?:\+44|^0)/.test(a.replace(/\s/g, ""));
      const bUk = /(?:\+44|^0)/.test(b.replace(/\s/g, ""));
      if (aUk !== bUk) return aUk ? -1 : 1;
      return digitsOf(b).length - digitsOf(a).length;
    });
  return ranked[0] ? normalizePhone(ranked[0]) : null;
}

export function coercePublicPhone(value) {
  if (!value) return null;
  const digits = digitsOf(value);
  if (digits.length === 10 && digits.startsWith("1")) {
    return normalizePhone(`0${digits}`);
  }
  return normalizePhone(value) || extractPublicPhone(String(value));
}

export function phonesFromHtml(html) {
  if (!html) return null;
  const found = [];
  for (const match of String(html).matchAll(/href=["']tel:([^"']+)/gi)) {
    try {
      found.push(decodeURIComponent(match[1]));
    } catch {
      found.push(match[1]);
    }
  }
  for (const match of String(html).matchAll(/itemprop=["']telephone["'][^>]*>([^<]+)/gi)) {
    found.push(match[1]);
  }
  for (const match of String(html).matchAll(/"telephone"\s*:\s*"([^"]+)"/gi)) {
    found.push(match[1]);
  }
  for (const raw of found) {
    const phone = coercePublicPhone(raw);
    if (phone) return phone;
  }
  return null;
}

export function phoneFromOsmTags(tags = {}) {
  for (const key of OSM_PHONE_KEYS) {
    const phone = normalizePhone(tags[key]);
    if (phone) return phone;
  }
  return null;
}

export function telHref(phone) {
  const digits = digitsOf(phone);
  if (!digits) return "";
  if (digits.startsWith("00")) return `tel:+${digits.slice(2)}`;
  if (digits.startsWith("44")) return `tel:+${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `tel:+${digits}`;
  if (digits.startsWith("0")) return `tel:+44${digits.slice(1)}`;
  return `tel:${digits}`;
}

export function sameBusinessName(a, b) {
  const norm = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const left = norm(a);
  const right = norm(b);
  return Boolean(left) && left === right;
}

export function sharePhonesByName(leads) {
  const byName = new Map();
  for (const lead of leads) {
    const phone = normalizePhone(lead.phone);
    if (!phone) continue;
    const key = String(lead.name || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (key && !byName.has(key)) byName.set(key, phone);
  }
  for (const lead of leads) {
    if (lead.phone) continue;
    const key = String(lead.name || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (byName.has(key)) lead.phone = byName.get(key);
  }
  return leads;
}
