export const PIN_HASH = "4dd222343f5c557c9f98f458101382dee379b0dce7457fbf04deeec97ca1ce98";

const PIN_HASHES = new Set([
  PIN_HASH,
  "2cb4c199b3984fb140434e741377afde09441f3326443192294f2a15f598a94c",
  "ebd85e4e958bddd64de832f8fd07d256f2aa20672138385c451368ee519ca8da",
  "ed211bc733f161e4f3a58640940136d25ce125b6df35f509c5ddf02c6d234002",
  "01e7f9c1ad6a40bceee10d460b38e5613bce6605993e8f9afb50fa3b8b279995",
]);

export async function hashPin(pin) {
  const text = String(pin || "").trim();
  if (globalThis.crypto?.subtle) {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const nodeCrypto = await import("node:crypto");
  return nodeCrypto.createHash("sha256").update(text).digest("hex");
}

export async function pinMatches(pin) {
  const trimmed = String(pin || "").trim();
  if (!trimmed) return false;
  const variants = [trimmed, trimmed.replace(/-/g, "")];
  for (const value of variants) {
    if (PIN_HASHES.has(await hashPin(value))) return true;
  }
  return false;
}
