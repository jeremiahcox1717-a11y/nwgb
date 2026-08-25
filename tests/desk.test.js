import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const tmp = path.join(os.tmpdir(), `nwgb-desk-${process.pid}.json`);
process.env.NWGB_STORE = tmp;
process.env.OWNER_NAME = "Jordan";

const { initData } = await import("../server/data-files.js");
const postcodes = await import("../server/postcodes.js");
const classify = await import("../server/classify.js");
const access = await import("../server/access.js");

before(async () => {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  await initData();
});

after(() => {
  for (const file of [tmp, `${tmp}.tmp`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("given postcodes never come out twice", () => {
  const first = postcodes.nextPostcode({ country: "GB", nation: "England", town: "Manchester" });
  assert.ok(first.code);
  assert.equal(first.exhausted, false);
  const second = postcodes.nextPostcode({ country: "GB", nation: "England", town: "Manchester" });
  assert.notEqual(second.code, first.code);
  const used = new Set(postcodes.givenSet());
  assert.ok(used.has(first.compact));
  assert.ok(used.has(second.compact));
  const third = postcodes.nextPostcode({ country: "GB", nation: "England", town: "Manchester" });
  assert.notEqual(third.code, first.code);
  assert.notEqual(third.code, second.code);
});

test("undo puts a code back into the machine", () => {
  const ticket = postcodes.nextPostcode({ country: "GB", nation: "England", town: "Leeds" });
  const removed = postcodes.undoLastGiven();
  assert.equal(removed.code, ticket.code);
  const again = postcodes.nextPostcode({ country: "GB", nation: "England", town: "Leeds" });
  assert.equal(again.code, ticket.code);
});

test("hunting a typed postcode burns it for the generator", () => {
  postcodes.markGiven("SW1A");
  const next = postcodes.nextPostcode({ country: "GB", area: "SW1A" });
  assert.equal(next.exhausted, true);
});

test("instagram booking snippets are not treated as naked shops", () => {
  assert.equal(classify.snippetSuggestsWebsiteOrBooking("Book now on Fresha"), true);
  assert.equal(classify.snippetSuggestsWebsiteOrBooking("Hair by Nina, Didsbury"), false);
  assert.equal(classify.isBookingUrl("https://fresha.com/a/salon"), true);
  assert.equal(classify.isRealWebsite("https://instagram.com/nina.hair"), false);
  assert.equal(classify.isRealWebsite("https://ninahair.co.uk"), true);
});

test("score hot when there is no google profile and no website", () => {
  assert.equal(
    classify.scoreLead({ hasWebsite: false, hasBooking: false, google: "none", instagram: null }),
    "hot",
  );
  assert.equal(
    classify.scoreLead({ hasWebsite: false, hasBooking: false, google: "blank", instagram: null }),
    "hot",
  );
  assert.equal(
    classify.scoreLead({ hasWebsite: true, hasBooking: false, google: "complete", instagram: null }),
    "skip",
  );
});

test("chain names are skipped", () => {
  assert.equal(classify.isChainName("Greggs", ["greggs", "tesco"]), true);
  assert.equal(classify.isChainName("Nina's Clippers", ["greggs", "tesco"]), false);
});

test("desk PIN hash rejects a wrong guess", async () => {
  assert.equal(await access.pinMatches(""), false);
  assert.equal(await access.pinMatches("password"), false);
  assert.equal(access.PIN_HASH.length, 64);
});
