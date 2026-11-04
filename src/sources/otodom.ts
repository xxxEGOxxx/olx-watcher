import { extractDescriptionCosts, htmlToText } from "../description.ts";
import type { Listing } from "../listing.ts";
import { plnToGrosze } from "../money.ts";
import { extractNextData, type FetchHtml } from "./http.ts";
import type { ListingRef, ListingSource } from "./types.ts";

const ORIGIN = "https://www.otodom.pl";

/** Only the fields we read; otodom's payload is much larger and may change without notice. */
type OtodomSearch = {
  props: {
    pageProps: { data: { searchAds: { items: Array<{ id: number; slug: string }> } } };
  };
};

type OtodomAd = {
  id: number;
  title: string;
  url: string;
  createdAt?: string;
  advertiserType?: string;
  description?: string;
  characteristics?: Array<{ key: string; value: string }>;
  location?: {
    coordinates?: { latitude: number; longitude: number } | null;
    mapDetails?: { radius?: number } | null;
    reverseGeocoding?: { locations?: Array<{ locationLevel: string; name: string }> } | null;
    address?: { street?: { name?: string | null } | null } | null;
  };
};

export function isOtodomUrl(url: string): boolean {
  return URL.canParse(url) && new URL(url).hostname === "www.otodom.pl";
}

/** Newest-first search: force LATEST/DESC so new listings are on the first page. */
export function normalizeSearchUrl(searchUrl: string): string {
  const url = new URL(searchUrl);
  url.searchParams.set("by", "LATEST");
  url.searchParams.set("direction", "DESC");
  return url.toString();
}

/**
 * "otodom:ID4DQGY" from the link's trailing token. Links are what both otodom and OLX copies
 * (`external_url`) share, so the same flat gets the same id on every runner.
 */
export function otodomRefId(urlOrSlug: string, fallbackId: number | string): string {
  return `otodom:${/-(ID[0-9A-Za-z]+)\/?$/.exec(urlOrSlug)?.[1] ?? fallbackId}`;
}

export function parseSearch(html: string): ListingRef[] {
  const data = extractNextData(html) as OtodomSearch;
  const items = data.props?.pageProps?.data?.searchAds?.items;
  if (!Array.isArray(items)) throw new Error("otodom search: searchAds.items missing");
  return items.map((item) => ({
    id: otodomRefId(item.slug, item.id),
    url: `${ORIGIN}/pl/oferta/${item.slug}`,
  }));
}

export function parseAd(html: string): Listing {
  const data = extractNextData(html) as { props?: { pageProps?: { ad?: OtodomAd } } };
  const ad = data.props?.pageProps?.ad;
  if (!ad) throw new Error("otodom ad: pageProps.ad missing (removed or not an ad page)");

  const characteristic = (key: string) =>
    ad.characteristics?.find((item) => item.key === key)?.value ?? null;
  const money = (key: string) => {
    const value = Number(characteristic(key));
    return characteristic(key) !== null && Number.isFinite(value) ? plnToGrosze(value) : null;
  };

  const description = htmlToText(ad.description ?? "");
  const fromText = extractDescriptionCosts(`${ad.title}\n${description}`);
  const isPrivate = ad.advertiserType === "private";
  // A private landlord charges no agency commission unless the text says otherwise.
  const agencyFee =
    fromText.agencyFee.kind === "unknown" && isPrivate
      ? { kind: "none" as const }
      : fromText.agencyFee;

  const levels = ad.location?.reverseGeocoding?.locations ?? [];
  const level = (name: string) => levels.find((item) => item.locationLevel === name)?.name ?? null;
  const district = [level("district"), level("residential")].filter(Boolean).join(", ") || null;
  const street = ad.location?.address?.street?.name ?? null;
  const coordinates = ad.location?.coordinates ?? null;
  const area = Number(characteristic("m"));

  return {
    id: otodomRefId(ad.url, ad.id),
    url: ad.url,
    title: ad.title,
    description,
    postedAt: ad.createdAt ? new Date(ad.createdAt) : null,
    price: money("price"),
    adminRent: money("rent") ?? fromText.adminRent,
    utilities: fromText.utilities,
    deposit: money("deposit") ?? fromText.deposit,
    agencyFee,
    isAgency: ad.advertiserType ? !isPrivate : null,
    areaM2: Number.isFinite(area) && area > 0 ? area : null,
    rooms: characteristic("rooms_num"),
    location: {
      city: level("city_or_village"),
      district: [district, street].filter(Boolean).join(", ") || null,
      lat: coordinates?.latitude ?? null,
      lon: coordinates?.longitude ?? null,
      approximate: (ad.location?.mapDetails?.radius ?? 0) > 0,
    },
  };
}

export function createOtodomSource(fetchHtml: FetchHtml): ListingSource {
  return {
    kind: "otodom",
    handles: isOtodomUrl,
    search: async (searchUrl) => parseSearch(await fetchHtml(normalizeSearchUrl(searchUrl))),
    details: async (ref) => parseAd(await fetchHtml(ref.url)),
  };
}
