import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractDescriptionCosts } from "../src/description.ts";
import { costBreakdown, type Listing } from "../src/listing.ts";
import { formatPln, parsePln } from "../src/money.ts";

export function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "olx:1",
    url: "https://www.olx.pl/d/oferta/test-ID1.html",
    title: "Mieszkanie 2 pokoje",
    description: "",
    postedAt: null,
    price: 300_000,
    adminRent: 60_000,
    utilities: null,
    deposit: 300_000,
    agencyFee: { kind: "percent", percent: 50 },
    isAgency: true,
    areaM2: 45,
    rooms: "2",
    location: { city: "Warszawa", district: "Mokotów", lat: 52.19, lon: 21.02, approximate: true },
    ...overrides,
  };
}

describe("money", () => {
  it("parses Polish amounts into grosze", () => {
    assert.equal(parsePln("2 500 zł"), 250_000);
    assert.equal(parsePln("2.500,50 zł"), 250_050);
    assert.equal(parsePln("600"), 60_000);
    assert.equal(parsePln("brak"), null);
  });

  it("formats grosze with non-breaking separators", () => {
    assert.equal(formatPln(250_000), "2 500 zł");
    assert.equal(formatPln(250_050), "2 500,50 zł");
  });
});

describe("description costs", () => {
  it("finds deposit, admin rent, utilities and a percent fee", () => {
    const costs = extractDescriptionCosts(
      "Cena 3000 zł + czynsz administracyjny 650 zł + media ok. 200 zł. Kaucja: 3 000 zł. Prowizja 50%.",
    );
    assert.equal(costs.adminRent, 65_000);
    assert.equal(costs.utilities, 20_000);
    assert.equal(costs.deposit, 300_000);
    assert.deepEqual(costs.agencyFee, { kind: "percent", percent: 50 });
  });

  it("does not treat the rent itself as admin rent", () => {
    assert.equal(extractDescriptionCosts("Czynsz najmu 3000 zł").adminRent, null);
  });

  it("recognizes no-commission offers and included utilities", () => {
    const costs = extractDescriptionCosts("Bez prowizji! Media wliczone 300 zł w cenę.");
    assert.deepEqual(costs.agencyFee, { kind: "none" });
    assert.equal(costs.utilities, 0);
    assert.equal(extractDescriptionCosts("Czynsz 2000 zł").utilities, null);
  });

  it("reads a fixed commission", () => {
    assert.deepEqual(extractDescriptionCosts("Prowizja biura: 1 500 zł").agencyFee, {
      kind: "amount",
      amount: 150_000,
    });
  });
});

describe("cost breakdown", () => {
  it("sums known monthly and move-in parts and lists the missing ones", () => {
    const cost = costBreakdown(listing());
    assert.equal(cost.monthly, 360_000);
    assert.equal(cost.agencyFee, 150_000);
    assert.equal(cost.moveIn, 360_000 + 300_000 + 150_000);
    assert.deepEqual(cost.missing, ["media"]);
  });

  it("cannot resolve a percent fee without a price", () => {
    const cost = costBreakdown(listing({ price: null }));
    assert.equal(cost.agencyFee, null);
    assert.ok(cost.missing.includes("prowizja"));
  });
});
