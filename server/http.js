const DEFAULT_UA =
  "NWGB/1.0 (private lead desk; contact: jeremiahcox1717@gmail.com)";

export async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  try {
    const headers = {
      Accept: options.accept || "*/*",
      ...(options.headers || {}),
    };
    if (typeof window === "undefined") {
      headers["User-Agent"] = headers["User-Agent"] || DEFAULT_UA;
    } else {
      delete headers["User-Agent"];
      delete headers["Referer"];
      delete headers.Referer;
    }
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, options = {}) {
  const result = await fetchText(url, {
    ...options,
    accept: "application/json",
  });
  let json = null;
  try {
    json = result.text ? JSON.parse(result.text) : null;
  } catch {
    json = null;
  }
  return { ...result, json };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
