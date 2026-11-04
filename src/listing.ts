import { type Grosze, percentOf } from "./money.ts";

/** A rental listing normalized from any source (OLX API, page, e-mail alert...). */
export type Listing = {
  /** Stable source id, e.g. "olx:123456789". Used for de-duplication. */
  id: string;
  url: string;
  title: string;
  description: string;
  postedAt: Date | null;
  /** Monthly rent asked by the landlord ("cena"). */
  price: Grosze | null;
  /** "Czynsz administracyjny" paid to the building on top of the rent. */
  adminRent: Grosze | null;
  /** Utilities ("media") when the listing states a figure. */
  utilities: Grosze | null;
  /** Refundable deposit ("kaucja"), one-time. */
  deposit: Grosze | null;
  /** Agency commission ("prowizja biura"), one-time. */
  agencyFee: AgencyFee;
  /** true = "Firma"/agency, false = "Prywatne", null = unknown. */
  isAgency: boolean | null;
  areaM2: number | null;
  rooms: string | null;
  location: ListingLocation;
};

export type AgencyFee =
  | { kind: "none" }
  | { kind: "amount"; amount: Grosze }
  | { kind: "percent"; percent: number }
  | { kind: "unknown" };

export type ListingLocation = {
  city: string | null;
  district: string | null;
  lat: number | null;
  lon: number | null;
  /** OLX often shows only an approximate circle instead of the exact point. */
  approximate: boolean;
};

export type CostBreakdown = {
  /** Rent + admin rent + utilities, counting only the parts that are known. */
  monthly: Grosze | null;
  /** First month + deposit + agency fee, counting only the parts that are known. */
  moveIn: Grosze | null;
  agencyFee: Grosze | null;
  /** Human-readable names of the parts that were not found, so totals are not overstated. */
  missing: string[];
};

export function costBreakdown(listing: Listing): CostBreakdown {
  const missing: string[] = [];
  if (listing.price === null) missing.push("цена");
  if (listing.adminRent === null) missing.push("czynsz administracyjny");
  if (listing.utilities === null) missing.push("media");
  if (listing.deposit === null) missing.push("kaucja");

  const agencyFee = resolveAgencyFee(listing.agencyFee, listing.price);
  if (agencyFee === null) missing.push("prowizja");

  const monthlyParts = [listing.price, listing.adminRent, listing.utilities];
  const monthly = sumKnown(monthlyParts);
  const moveIn = sumKnown([monthly, listing.deposit, agencyFee]);
  return { monthly, moveIn, agencyFee, missing };
}

function resolveAgencyFee(fee: AgencyFee, price: Grosze | null): Grosze | null {
  switch (fee.kind) {
    case "none":
      return 0;
    case "amount":
      return fee.amount;
    case "percent":
      return price === null ? null : percentOf(price, fee.percent);
    case "unknown":
      return null;
  }
}

function sumKnown(parts: Array<Grosze | null>): Grosze | null {
  const known = parts.filter((part): part is Grosze => part !== null);
  return known.length === 0 ? null : known.reduce((total, part) => total + part, 0);
}
