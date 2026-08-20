import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { passwordsMatch, signSession, verifySession } from "./auth.ts";

describe("passwordsMatch", () => {
  it("accepts the correct password", () => {
    assert.equal(passwordsMatch("secret-pass", "secret-pass"), true);
  });

  it("rejects a wrong password of the same length", () => {
    assert.equal(passwordsMatch("secret-pass", "secret-pasX"), false);
  });

  it("rejects a different length without throwing", () => {
    assert.equal(passwordsMatch("short", "much-longer-password"), false);
  });
});

describe("session cookies", () => {
  const secret = "test-secret";

  it("round-trips a signed session", async () => {
    const token = await signSession(1_700_000_000_000, secret);
    assert.equal(await verifySession(token, 1_700_000_000_000, secret), true);
  });

  it("rejects an expired session", async () => {
    const token = await signSession(1_000, secret);
    assert.equal(await verifySession(token, 1_000 + 8 * 24 * 60 * 60 * 1000, secret), false);
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(1_700_000_000_000, secret);
    const [version, exp, nonce] = token.split(".");
    const tampered = `${version}.${exp}.${nonce}.deadbeef`;
    assert.equal(await verifySession(tampered, 1_700_000_000_000, secret), false);
  });
});
