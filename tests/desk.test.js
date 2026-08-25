import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const tmp = path.join(os.tmpdir(), `nwgb-desk-${process.pid}.json`);
process.env.NWGB_STORE = tmp;
process.env.OWNER_NAME = "Jordan";

const postcodes = await import("../server/postcodes.js");
const classify = await import("../server/classify.js");
const niches = await import("../server/niches.js");

before(() => {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
});

after(() => {
  for (const file of [tmp, `${tmp}.tmp`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("place cascade fills countries cities and postcodes", () => {
  const continents = postcodes.placeCatalog().continents;
  assert.deepEqual(continents, [
    "Africa",
    "Antarctica",
    "Asia",
    "Europe",
    "North America",
    "Oceania",
    "South America",
  ]);
  const europeEnglish = postcodes.countriesFor("Europe", "English");
  assert.ok(europeEnglish.some((row) => row.code === "GB"));
  assert.ok(europeEnglish.some((row) => row.code === "IE"));
  const africaEnglish = postcodes.countriesFor("Africa", "English");
  assert.ok(africaEnglish.some((row) => row.code === "NG"));
  const asia = postcodes.countriesFor("Asia", "English");
  assert.ok(asia.some((row) => row.code === "IN"));
  const us = postcodes.countriesFor("North America", "English");
  assert.ok(us.some((row) => row.code === "US"));
  const manchester = postcodes.citiesFor({ continent: "Europe", language: "English", country: "GB" });
  assert.ok(manchester.includes("Manchester"));
  const wales = postcodes.citiesFor({ continent: "Europe", language: "Welsh", country: "GB" });
  assert.ok(wales.includes("Aberdare"));
  assert.equal(wales.includes("Manchester"), false);
  const tokyo = postcodes.citiesFor({ continent: "Asia", language: "English", country: "JP" });
  assert.ok(tokyo.includes("Tokyo"));
  const before = postcodes.nextPostcode({ continent: "Europe", language: "English", country: "GB" });
  assert.equal(before.exhausted, true);
  const ticket = postcodes.nextPostcode({
    continent: "Europe",
    language: "English",
    country: "GB",
    city: "Manchester",
  });
  assert.ok(ticket.code);
  assert.equal(ticket.town, "Manchester");
});

test("given postcodes never come out twice", () => {
  const first = postcodes.nextPostcode({ country: "GB", city: "Manchester" });
  assert.ok(first.code);
  assert.equal(first.exhausted, false);
  const second = postcodes.nextPostcode({ country: "GB", city: "Manchester" });
  assert.notEqual(second.code, first.code);
  const used = new Set(postcodes.givenSet());
  assert.ok(used.has(first.compact));
  assert.ok(used.has(second.compact));
  const third = postcodes.nextPostcode({ country: "GB", city: "Manchester" });
  assert.notEqual(third.code, first.code);
  assert.notEqual(third.code, second.code);
});

test("undo puts a code back into the machine", () => {
  const ticket = postcodes.nextPostcode({ country: "GB", city: "Leeds" });
  const removed = postcodes.undoLastGiven();
  assert.equal(removed.code, ticket.code);
  const again = postcodes.nextPostcode({ country: "GB", city: "Leeds" });
  assert.equal(again.code, ticket.code);
});

test("hunting a typed postcode burns it for the generator", () => {
  const ticket = postcodes.nextPostcode({ country: "GB", city: "Milltimber" });
  assert.ok(ticket.code);
  const next = postcodes.nextPostcode({ country: "GB", city: "Milltimber" });
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

test("instagram hunt looks for barbers stylists and braiders", () => {
  const beauty = niches.instagramHuntPlans("Manchester", "beauty");
  const labels = beauty.map((row) => row.label);
  assert.deepEqual(labels, ["Barbers", "Braiders", "Stylists", "Locs / weaves", "Nails / lashes"]);
  const blob = beauty.map((row) => row.query).join(" ");
  assert.match(blob, /barber/);
  assert.match(blob, /braider/);
  assert.match(blob, /hair stylist/);
  assert.match(blob, /site:instagram.com/);
  assert.equal(niches.looksLikeHairTrade("Braids by Nina · Manchester"), true);
  assert.equal(niches.looksLikeHairTrade("fadez_mcr"), true);
  assert.equal(niches.looksLikeHairTrade("Joe's plumbing and boilers"), false);
  assert.ok(niches.OSM_NICHE_REGEX.beauty.includes("barber"));
  assert.deepEqual(niches.googlePlaceTypesFor("beauty"), ["hair_care", "beauty_salon", "spa"]);
});

