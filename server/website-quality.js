import { fetchText } from "./http.js";
import { hostOf, isRealWebsite } from "./classify.js";

const LEGACY_HOSTS = [
  "tripod.com",
  "geocities",
  "angelfire.com",
  "webs.com",
  "000webhost",
  "freewebs.com",
  "homestead.com",
  "fortunecity",
  "bizland.com",
  "bravehost.com",
  "moonfruit.com",
  "yolasite.com",
  "weebly.com",
  "wixsite.com",
  "sites.google.com",
  "blogspot.com",
  "blogger.com",
  "wordpress.com",
  "jimdofree.com",
  "square.site",
];

const CRITICAL_REASONS = new Set([
  "parked domain",
  "under construction",
  "frameset",
  "flash",
  "legacy host",
  "http only",
  "nearly empty",
]);

export function assessWebsiteUrl(url) {
  const reasons = [];
  if (!url || !isRealWebsite(url)) {
    return { outdated: false, reasons, quality: "none", score: 0 };
  }

  const raw = String(url).trim();
  const host = hostOf(raw);
  let parsed;
  try {
    parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return { outdated: true, reasons: ["broken url"], quality: "outdated", score: 3 };
  }

  if (parsed.protocol === "http:") reasons.push("http only");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) reasons.push("ip host");
  if (/\.(html?|asp|php)$/i.test(parsed.pathname) && parsed.pathname.split("/").length <= 2) {
    reasons.push("legacy filename");
  }
  if (LEGACY_HOSTS.some((token) => host.includes(token))) reasons.push("legacy host");
  if (/~[a-z0-9_-]+/i.test(parsed.pathname)) reasons.push("tilde path");

  const score = reasons.length;
  const outdated = reasons.some((r) => CRITICAL_REASONS.has(r)) || score >= 2;
  return {
    outdated,
    reasons,
    quality: outdated ? "outdated" : "ok",
    score,
  };
}

export function assessWebsiteHtml(html, url) {
  const base = assessWebsiteUrl(url);
  const reasons = [...base.reasons];
  const text = String(html || "");
  if (!text) {
    return {
      ...base,
      outdated: base.outdated || true,
      reasons: reasons.length ? reasons : ["unreachable"],
      quality: "outdated",
      score: Math.max(base.score, 2),
    };
  }

  const lower = text.toLowerCase();

  if (/best viewed (with|in).*(internet explorer|netscape|800\s*x\s*600)/i.test(text)) {
    reasons.push("legacy browser notice");
  }
  if (/<marquee\b/i.test(text)) reasons.push("marquee");
  if (/<frameset\b/i.test(text)) reasons.push("frameset");
  if (/guestbook|hit counter|web counter|digits\.net/i.test(text)) reasons.push("guestbook/counter");
  if (!/<meta[^>]+name=["']viewport["']/i.test(text)) reasons.push("no mobile viewport");
  if (/last\s*updated[^<\d]*(19\d{2}|200\d|201[0-5])/i.test(text)) reasons.push("stale last-updated");
  if (
    /(?:copyright|©|&copy;)\s*(?:19\d{2}|200\d|201[0-6])/i.test(text) &&
    !/202[0-6]/.test(text)
  ) {
    reasons.push("old copyright");
  }
  if (/under construction|coming soon|website coming soon|site under construction/i.test(text)) {
    reasons.push("under construction");
  }
  if (
    /this domain (is for sale|may be for sale)|parked free|sedoparking|godaddy parking|hugedomains|dan\.com\/buy/i.test(
      lower,
    )
  ) {
    reasons.push("parked domain");
  }
  if (/application\/x-shockwave-flash|\.swf\b/i.test(text)) reasons.push("flash");

  const tables = (text.match(/<table\b/gi) || []).length;
  const divs = (text.match(/<div\b/gi) || []).length;
  if (tables >= 5 && tables > divs) reasons.push("table layout");

  const visible = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (visible.length < 140) reasons.push("nearly empty");

  const unique = [...new Set(reasons)];
  const critical = unique.some((r) => CRITICAL_REASONS.has(r));
  const score = unique.length + (critical ? 1 : 0);
  const outdated = critical || unique.length >= 2;
  return {
    outdated,
    reasons: unique,
    quality: outdated ? "outdated" : "ok",
    score,
  };
}

export async function inspectWebsite(url, options = {}) {
  const urlCheck = assessWebsiteUrl(url);
  if (!url || !isRealWebsite(url)) {
    return { ...urlCheck, fetched: false };
  }

  const href = String(url).startsWith("http") ? String(url) : `https://${url}`;
  try {
    const res = await fetchText(href, {
      timeoutMs: options.timeoutMs || 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return {
        outdated: true,
        reasons: [...urlCheck.reasons, `http ${res.status}`],
        quality: "outdated",
        score: Math.max(urlCheck.score, 2),
        fetched: true,
      };
    }
    return { ...assessWebsiteHtml(res.text, href), fetched: true };
  } catch {
    // URL heuristics alone still count when the page will not load from this machine.
    if (urlCheck.outdated) return { ...urlCheck, fetched: false };
    return {
      outdated: true,
      reasons: [...urlCheck.reasons, "unreachable"],
      quality: "outdated",
      score: Math.max(urlCheck.score, 2),
      fetched: false,
    };
  }
}
