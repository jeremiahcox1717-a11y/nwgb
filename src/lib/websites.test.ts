import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNoWebsiteLead, websiteKind } from "./websites.ts";

describe("websiteKind", () => {
  it("treats missing and blank urls as no website", () => {
    assert.equal(websiteKind(null), "none");
    assert.equal(websiteKind(""), "none");
    assert.equal(websiteKind("   "), "none");
  });

  it("treats social profiles as social", () => {
    assert.equal(websiteKind("https://www.facebook.com/joesplumbing"), "social");
    assert.equal(websiteKind("https://instagram.com/shop"), "social");
    assert.equal(websiteKind("https://www.yelp.com/biz/place"), "social");
    assert.equal(websiteKind("https://linktr.ee/localbiz"), "social");
  });

  it("treats Google Maps and Business Profile urls as no website", () => {
    assert.equal(websiteKind("https://maps.google.com/?cid=1"), "none");
    assert.equal(websiteKind("https://business.google.com/dashboard"), "none");
  });

  it("keeps real websites", () => {
    assert.equal(websiteKind("https://joesplumbing.com"), "website");
    assert.equal(websiteKind("https://sites.google.com/view/joes-plumbing"), "website");
  });
});

describe("isNoWebsiteLead", () => {
  it("keeps listings with no site", () => {
    assert.equal(isNoWebsiteLead(null, false), true);
  });

  it("drops real websites", () => {
    assert.equal(isNoWebsiteLead("https://example.com", true), false);
  });

  it("optionally keeps social-only listings", () => {
    assert.equal(isNoWebsiteLead("https://facebook.com/x", false), false);
    assert.equal(isNoWebsiteLead("https://facebook.com/x", true), true);
  });
});
