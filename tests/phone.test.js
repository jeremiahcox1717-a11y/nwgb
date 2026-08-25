import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractPublicPhone,
  normalizePhone,
  phoneFromOsmTags,
  phonesFromHtml,
  sharePhonesByName,
  telHref,
} from "../server/phone.js";
import { phoneFromSearchResults } from "../server/hunt-google.js";

test("extracts public UK and US numbers from listing text", () => {
  assert.equal(
    extractPublicPhone("Hair salon in Didsbury · 4.6 ★ · 0161 445 2190 · Open now"),
    "0161 445 2190",
  );
  assert.equal(
    extractPublicPhone("Call +44 20 7946 0958 for bookings"),
    "+44 20 7946 0958",
  );
  assert.equal(extractPublicPhone("Barber shop (512) 555-0199 Austin TX"), "(512) 555-0199");
});

test("does not treat postcodes, ratings, or prices as phones", () => {
  assert.equal(extractPublicPhone("Nina's Clippers, M20 3BB, 4.8 stars, £25 cut"), null);
  assert.equal(extractPublicPhone("Open 10:00-18:00 · 128 reviews"), null);
});

test("reads OSM public contact tags", () => {
  assert.equal(phoneFromOsmTags({ "contact:mobile": "07700 900123" }), "07700 900123");
  assert.equal(phoneFromOsmTags({ website: "https://example.com" }), null);
  assert.equal(normalizePhone("  0161 123 4567  "), "0161 123 4567");
});

test("copies a public number onto the same shop from another source", () => {
  const leads = [
    { name: "Nina's Clippers", source: "osm", phone: null },
    { name: "Nina’s Clippers", source: "google", phone: "0161 111 2222" },
  ];
  sharePhonesByName(leads);
  assert.equal(leads[0].phone, "0161 111 2222");
});

test("tel links and directory HTML expose public numbers", () => {
  assert.equal(telHref("0161 445 2190"), "tel:+441614452190");
  assert.equal(telHref("+44 161 445 2190"), "tel:+441614452190");
  assert.equal(
    phonesFromHtml(`<a href="tel:1612286262">Call</a>`),
    "01612286262",
  );
  assert.equal(
    phonesFromHtml(`<span itemprop="telephone">0161 228 6262</span>`),
    "0161 228 6262",
  );
  assert.equal(phonesFromHtml(`<p>No contact</p>`), null);
});

test("search result snippets can carry a public phone", () => {
  assert.equal(
    phoneFromSearchResults([
      {
        title: "Nina's Clippers",
        href: "https://www.google.com/maps/place/ninas",
        snippet: "Hairdresser in Manchester · 0161 445 2190 · No website",
      },
    ]),
    "0161 445 2190",
  );
});
