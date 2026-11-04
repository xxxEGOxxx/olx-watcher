import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { costBreakdown } from "../src/listing.ts";
import {
  buildApiUrl,
  isOlxUrl,
  olxAdIdFromHtml,
  parseOlxSearch,
  splitSearchUrl,
} from "../src/sources/olx.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/olx-search.json", import.meta.url), "utf8"),
);

describe("olx search url", () => {
  it("maps web filters to API parameters and forces newest first", () => {
    const { friendlyPath, filters } = splitSearchUrl(
      "https://www.olx.pl/nieruchomosci/mieszkania/wynajem/poznan/q-balkon/?search%5Bfilter_float_price%3Ato%5D=3000&search%5Bfilter_enum_rooms%5D%5B0%5D=two&search%5Border%5D=filter_float_price%3Aasc",
    );
    assert.equal(friendlyPath, "nieruchomosci,mieszkania,wynajem,poznan");
    assert.equal(filters.get("filter_float_price:to"), "3000");
    assert.equal(filters.get("filter_enum_rooms[0]"), "two");
    assert.equal(filters.get("query"), "balkon");
    assert.equal(filters.get("sort_by"), "created_at:desc");

    const api = new URL(buildApiUrl({ category_id: 15, region_id: 1, city_id: 13983 }, filters));
    assert.equal(api.pathname, "/api/v1/offers/");
    assert.equal(api.searchParams.get("city_id"), "13983");
    assert.equal(api.searchParams.get("filter_float_price:to"), "3000");
    assert.ok(isOlxUrl("https://www.olx.pl/d/oferta/x-CID3-ID1bL7cK.html"));
    assert.ok(!isOlxUrl("https://www.otodom.pl/pl/oferta/x"));
  });

  it("finds the numeric ad id on an ad page", () => {
    assert.equal(olxAdIdFromHtml("<span>ID: <!-- -->1089901642</span>"), "1089901642");
    assert.throws(() => olxAdIdFromHtml("<p>nothing</p>"), /ad id not found/);
  });
});

describe("olx api ads", () => {
  const [privateAd, agencyAd, otodomCopy] = parseOlxSearch(fixture, { skipOtodomCopies: false });

  it("reads price, admin rent, deposit and the approximate map point of a private ad", () => {
    const listing = privateAd?.listing;
    assert.ok(listing);
    assert.equal(privateAd?.id, "olx:1089901642");
    assert.equal(listing.price, 200_000);
    assert.equal(listing.adminRent, 62_100);
    assert.equal(listing.deposit, 400_000);
    assert.deepEqual(listing.agencyFee, { kind: "none" });
    assert.equal(listing.isAgency, false);
    assert.equal(listing.areaM2, 34);
    assert.equal(listing.rooms, "1");
    assert.equal(listing.location.district, "Stare Miasto");
    assert.equal(listing.location.approximate, true);
    assert.equal(costBreakdown(listing).monthly, 262_100);
    assert.match(listing.description, /Kaucja: 4000 zł\nOferta/);
  });

  it("treats media included in the admin rent as zero extra utilities", () => {
    const listing = agencyAd?.listing;
    assert.ok(listing);
    assert.equal(listing.isAgency, true);
    assert.equal(listing.adminRent, 140_000);
    assert.equal(listing.utilities, 0);
    assert.equal(listing.rooms, "4+");
  });

  it("keys otodom copies by the otodom id and can drop them", () => {
    assert.equal(otodomCopy?.id, "otodom:ID4DQGY");
    assert.deepEqual(otodomCopy?.listing?.agencyFee, { kind: "none" });
    assert.equal(otodomCopy?.listing?.location.approximate, false);
    assert.equal(parseOlxSearch(fixture, { skipOtodomCopies: true }).length, 2);
    assert.throws(
      () => parseOlxSearch({ error: "x" }, { skipOtodomCopies: false }),
      /data\[\] missing/,
    );
  });
});
