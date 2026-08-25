const cache = Object.create(null);

export async function loadJson(fileName) {
  if (cache[fileName]) return cache[fileName];
  if (typeof window !== "undefined") {
    const url = new URL(`../data/${fileName}`, import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${fileName}`);
    cache[fileName] = await res.json();
    return cache[fileName];
  }
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", fileName);
  cache[fileName] = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return cache[fileName];
}

export async function initData() {
  await Promise.all([
    loadJson("uk-outcodes.json"),
    loadJson("us-metros.json"),
    loadJson("chains.json"),
  ]);
}

export function dataFile(fileName) {
  if (!cache[fileName]) {
    throw new Error(`Data ${fileName} not loaded. Call initData() first.`);
  }
  return cache[fileName];
}
