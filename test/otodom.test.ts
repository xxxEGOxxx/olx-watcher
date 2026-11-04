import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { htmlToText } from "../src/description.ts";
import { costBreakdown } from "../src/listing.ts";
import { normalizeSearchUrl, parseAd, parseSearch } from "../src/sources/otodom.ts";

/** Fixtures are real otodom __NEXT_DATA__ payloads (2026-11-04), trimmed and without contacts. */
const page = (name: string) =>
  `<html><script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">${readFileSync(
    new URL(`./fixtures/${name}`, import.meta.url),
    "utf8",
  )}</script></html>`;

describe("otodom", () => {
  it("parses an ad page into a listing with structured costs and an exact point", () => {
    const listing = parseAd(page("otodom-ad.json"));
    assert.equal(listing.id, "otodom:68510486");
    assert.equal(listing.price, 180_000);
    assert.equal(listing.adminRent, 60_000);
    assert.equal(listing.deposit, 250_000);
    assert.equal(listing.areaM2, 29);
    assert.equal(listing.rooms, "1");
    assert.equal(listing.isAgency, true);
    assert.deepEqual(listing.agencyFee, { kind: "unknown" });
    assert.equal(listing.location.city, "Poznań");
    assert.equal(listing.location.district, "Stare Miasto, Centrum, ul. Ogrodowa");
    assert.equal(listing.location.approximate, false);
    assert.equal(listing.location.lat, 52.40381);
    assert.doesNotMatch(listing.description, /<|&nbsp;/);

    const cost = costBreakdown(listing);
    assert.equal(cost.monthly, 240_000);
    assert.deepEqual(cost.missing, ["media", "prowizja"]);
  });

  it("lists search results as refs to canonical ad URLs", () => {
    const refs = parseSearch(page("otodom-search.json"));
    assert.equal(refs.length, 6);
    assert.deepEqual(refs[0], {
      id: "otodom:68602616",
      url: "https://www.otodom.pl/pl/oferta/komfortowa-kawalerka-z-garazem-w-nowym-budynku-przy-dolnej-wildzie-ID4DQFO",
    });
  });

  it("forces newest-first sorting on search URLs", () => {
    const url = new URL(
      normalizeSearchUrl("https://www.otodom.pl/pl/wyniki/wynajem/mieszkanie/x?by=PRICE&limit=36"),
    );
    assert.equal(url.searchParams.get("by"), "LATEST");
    assert.equal(url.searchParams.get("direction"), "DESC");
    assert.equal(url.searchParams.get("limit"), "36");
  });

  it("fails loudly when the page has no Next.js data", () => {
    assert.throws(() => parseAd("<html></html>"), /__NEXT_DATA__ not found/);
  });
});

describe("htmlToText", () => {
  it("turns description HTML into plain text", () => {
    assert.equal(
      htmlToText("<p>KAUCJA: 2500&nbsp;zł</p><br/>Tel.&#58; x"),
      "KAUCJA: 2500 zł\n\nTel.: x",
    );
  });
});
