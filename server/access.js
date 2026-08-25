export const PIN_HASH = "4dd222343f5c557c9f98f458101382dee379b0dce7457fbf04deeec97ca1ce98";

export async function hashPin(pin) {
  const text = String(pin || "");
  if (globalThis.crypto?.subtle) {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const nodeCrypto = await import("node:crypto");
  return nodeCrypto.createHash("sha256").update(text).digest("hex");
}

export async function pinMatches(pin) {
  return (await hashPin(pin)) === PIN_HASH;
}
