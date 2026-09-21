import assert from "node:assert/strict";
import { test } from "node:test";
import { assessWebsiteHtml, assessWebsiteUrl } from "../server/website-quality.js";
import { googleTextQueriesFor } from "../server/niches.js";
import { resolveKnownCity } from "../server/geocode.js";

test("outdated website url heuristics catch legacy hosts and http", () => {
  const httpOnly = assessWebsiteUrl("http://example-salon.com");
  assert.equal(httpOnly.outdated, true);
  assert.ok(httpOnly.reasons.includes("http only"));

  const wix = assessWebsiteUrl("https://myshop.wixsite.com/salon");
  assert.equal(wix.outdated, true);
  assert.ok(wix.reasons.includes("legacy host"));

  const modern = assessWebsiteUrl("https://ninahair.co.uk");
  assert.equal(modern.outdated, false);
});

test("outdated website html heuristics catch parked and ancient pages", () => {
  const parked = assessWebsiteHtml(
    "<html><body>This domain is for sale on HugeDomains</body></html>",
    "https://oldshop.com",
  );
  assert.equal(parked.outdated, true);
  assert.ok(parked.reasons.includes("parked domain"));

  const ancient = assessWebsiteHtml(
    `<html><head><title>Salon</title></head><body>
      <marquee>Welcome</marquee>
      <p>Best viewed in Internet Explorer</p>
      <p>Copyright 2009</p>
    </body></html>`,
    "https://oldshop.com",
  );
  assert.equal(ancient.outdated, true);
  assert.ok(ancient.reasons.includes("marquee"));
});

test("google text queries search the city not a postcode", () => {
  const queries = googleTextQueriesFor("beauty", "Manchester");
  assert.ok(queries.length >= 3);
  assert.ok(queries.every((q) => q.includes("Manchester")));
  assert.ok(queries.some((q) => /barber/i.test(q)));
  assert.ok(queries.every((q) => !/\bM1\b/.test(q)));
});

test("known UK city resolves without a postcode", () => {
  const city = resolveKnownCity({ city: "Manchester", country: "GB", language: "English" });
  assert.equal(city.ok, true);
  assert.equal(city.kind, "city");
  assert.equal(city.postcode, "");
  assert.equal(city.town, "Manchester");
  assert.ok(typeof city.lat === "number");
  assert.ok(typeof city.lon === "number");
});
