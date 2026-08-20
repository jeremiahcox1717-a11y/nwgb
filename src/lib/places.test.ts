import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  geocodeLocation,
  locationIsTooBroad,
  selectLeads,
  toCsv,
  toPlaceHit,
  type GooglePlace,
} from "./places.ts";
import { rateLimit, resetRateLimitForTests } from "./rate-limit.ts";

const plumber: GooglePlace = {
  id: "abc",
  displayName: { text: "Joe's Plumbing" },
  formattedAddress: "12 King St, Toronto, ON",
  nationalPhoneNumber: "(416) 555-0100",
  businessStatus: "OPERATIONAL",
  primaryType: "plumber",
  googleMapsUri: "https://maps.google.com/?cid=1",
};

describe("selectLeads", () => {
  it("keeps businesses with no website", () => {
    const leads = selectLeads([plumber], false);
    assert.equal(leads.length, 1);
    assert.equal(leads[0]?.name, "Joe's Plumbing");
    assert.equal(leads[0]?.websiteKind, "none");
  });

  it("drops businesses that already have a site", () => {
    const leads = selectLeads(
      [{ ...plumber, websiteUri: "https://joesplumbing.ca" }],
      true,
    );
    assert.equal(leads.length, 0);
  });

  it("can keep social-only listings", () => {
    const withSocial: GooglePlace = {
      ...plumber,
      websiteUri: "https://facebook.com/joesplumbing",
    };
    assert.equal(selectLeads([withSocial], false).length, 0);
    assert.equal(selectLeads([withSocial], true)[0]?.websiteKind, "social");
  });

  it("skips permanently closed places and duplicates", () => {
    const closed: GooglePlace = { ...plumber, id: "closed", businessStatus: "CLOSED_PERMANENTLY" };
    const leads = selectLeads([plumber, plumber, closed], false);
    assert.equal(leads.length, 1);
  });
});

describe("toPlaceHit", () => {
  it("falls back to a place_id maps link", () => {
    const hit = toPlaceHit({ ...plumber, googleMapsUri: undefined });
    assert.equal(hit?.mapsUrl, "https://www.google.com/maps/place/?q=place_id:abc");
  });
});

describe("geocodeLocation", () => {
  it("maps a city result into a usable area", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "Austin, TX, USA",
              types: ["locality", "political"],
              geometry: {
                location: { lat: 30.2672, lng: -97.7431 },
                viewport: {
                  northeast: { lat: 30.5, lng: -97.5 },
                  southwest: { lat: 30.0, lng: -98.0 },
                },
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const geo = await geocodeLocation("Austin", "fake-key", fakeFetch);
    assert.equal(geo.label, "Austin, TX, USA");
    assert.equal(geo.location.lat, 30.2672);
  });

  it("rejects a country-level lookup", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "Canada",
              types: ["country", "political"],
              geometry: {
                location: { lat: 56, lng: -96 },
                viewport: {
                  northeast: { lat: 83, lng: -52 },
                  southwest: { lat: 41, lng: -141 },
                },
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await assert.rejects(
      () => geocodeLocation("Canada", "fake-key", fakeFetch),
      /city or a postal code/,
    );
  });
});

describe("locationIsTooBroad", () => {
  it("rejects country-level lookups", () => {
    assert.equal(locationIsTooBroad(["country", "political"]), true);
    assert.equal(locationIsTooBroad(["locality", "political"]), false);
    assert.equal(locationIsTooBroad(["postal_code"]), false);
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    const hit = toPlaceHit({
      ...plumber,
      displayName: { text: 'Joe "The Pipe" Plumbing' },
      formattedAddress: "12 King St, Toronto",
    });
    assert.ok(hit);
    const csv = toCsv([hit]);
    assert.match(csv, /"Joe ""The Pipe"" Plumbing"/);
    assert.match(csv, /"12 King St, Toronto"/);
  });
});

describe("rateLimit", () => {
  it("blocks after the limit inside the window", () => {
    resetRateLimitForTests();
    const first = rateLimit("ip", 2, 60_000, 1_000);
    const second = rateLimit("ip", 2, 60_000, 1_001);
    const third = rateLimit("ip", 2, 60_000, 1_002);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, false);
  });
});
