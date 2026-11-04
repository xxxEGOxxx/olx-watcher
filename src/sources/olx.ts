import { extractDescriptionCosts, htmlToText } from "../description.ts";
import type { AgencyFee, Listing } from "../listing.ts";
import { plnToGrosze } from "../money.ts";
import type { BrowserSession } from "./browser.ts";
import type { ListingRef, ListingSource } from "./types.ts";

const ORIGIN = "https://www.olx.pl";
const PAGE_SIZE = "40";

/** The fields we read from `/api/v1/offers`; the payload is larger and may change. */
export type OlxAd = {
  id: number;
  url: string;
  title: string;
  description?: string;
  created_time?: string;
  business?: boolean;
  partner?: { code?: string } | null;
  external_url?: string;
  params?: Array<{ key: string; value?: { key?: unknown; value?: unknown } }>;
  map?: { lat?: number; lon?: number; show_detailed?: boolean } | null;
  location?: { city?: { name?: string } | null; district?: { name?: string } | null } | null;
};

const ROOMS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4+" };

export function isOlxUrl(url: string): boolean {
  return URL.canParse(url) && new URL(url).hostname === "www.olx.pl";
}

/**
 * Splits a web search URL (what you copy from the address bar) into the friendly path that
 * `/api/v1/friendly-links/query-params/` resolves to category/region/city ids, and API filters.
 * `search[filter_float_price:to]=3000` → `filter_float_price:to=3000`, `search[order]` → `sort_by`,
 * a `q-<text>` path segment → `query`.
 */
export function splitSearchUrl(searchUrl: string): {
  friendlyPath: string;
  filters: URLSearchParams;
} {
  const url = new URL(searchUrl);
  const filters = new URLSearchParams();
  const segments = url.pathname.split("/").filter(Boolean);
  const keyword = segments.find((segment) => segment.startsWith("q-"));
  if (keyword) filters.set("query", decodeURIComponent(keyword.slice(2)).replaceAll("-", " "));

  for (const [key, value] of url.searchParams) {
    const match = /^search\[([^\]]+)\](.*)$/.exec(key);
    if (!match?.[1]) continue;
    if (match[1] === "order") continue;
    filters.append(`${match[1]}${match[2] ?? ""}`, value);
  }
  filters.set("sort_by", "created_at:desc");
  filters.set("offset", "0");
  filters.set("limit", PAGE_SIZE);
  return {
    friendlyPath: segments.filter((segment) => segment !== keyword).join(","),
    filters,
  };
}

export function buildApiUrl(ids: Record<string, unknown>, filters: URLSearchParams): string {
  const query = new URLSearchParams();
  for (const key of ["category_id", "region_id", "city_id", "district_id"]) {
    if (ids[key] !== undefined && ids[key] !== null) query.set(key, String(ids[key]));
  }
  for (const [key, value] of filters) query.append(key, value);
  return `${ORIGIN}/api/v1/offers/?${query}`;
}

/** Ad pages only carry the numeric API id in the footer: "ID: <!-- -->1089901642". */
export function olxAdIdFromHtml(html: string): string {
  const id = /ID:\s*(?:<!--\s*-->)?\s*(\d{6,})/.exec(html)?.[1];
  if (!id) throw new Error("olx: ad id not found on the page");
  return id;
}

/** OLX copies of otodom ads share the otodom id ("ID4DQGY") so cross-site duplicates collapse. */
export function olxRefId(ad: OlxAd): string {
  const otodomId =
    ad.partner?.code === "otodom_pl" ? /-(ID[0-9A-Za-z]+)$/.exec(ad.external_url ?? "")?.[1] : null;
  return otodomId ? `otodom:${otodomId}` : `olx:${ad.id}`;
}

export function parseOlxAd(ad: OlxAd): Listing {
  const param = (key: string) => ad.params?.find((item) => item.key === key)?.value;
  const numberOf = (raw: unknown) => {
    const value = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", "."));
    return raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) ? value : null;
  };

  const description = htmlToText(ad.description ?? "");
  const fromText = extractDescriptionCosts(`${ad.title}\n${description}`);
  const price = numberOf(param("price")?.value);
  const rent = numberOf(param("rent")?.key);
  const area = numberOf(param("m")?.key);
  const roomsKey = String(param("rooms")?.key ?? "");
  const agencyFee: AgencyFee =
    fromText.agencyFee.kind === "unknown" && ad.business === false
      ? { kind: "none" }
      : fromText.agencyFee;

  return {
    id: olxRefId(ad),
    url: ad.url,
    title: ad.title,
    description,
    postedAt: ad.created_time ? new Date(ad.created_time) : null,
    price: price === null ? null : plnToGrosze(price),
    adminRent: rent === null ? fromText.adminRent : plnToGrosze(rent),
    utilities: fromText.utilities,
    deposit: fromText.deposit,
    agencyFee,
    isAgency: typeof ad.business === "boolean" ? ad.business : null,
    areaM2: area && area > 0 ? area : null,
    rooms: ROOMS[roomsKey] ?? null,
    location: {
      city: ad.location?.city?.name ?? null,
      district: ad.location?.district?.name ?? null,
      lat: ad.map?.lat ?? null,
      lon: ad.map?.lon ?? null,
      approximate: ad.map?.show_detailed !== true,
    },
  };
}

export function parseOlxSearch(
  body: unknown,
  options: { skipOtodomCopies: boolean },
): ListingRef[] {
  const data = (body as { data?: OlxAd[] } | null)?.data;
  if (!Array.isArray(data)) throw new Error("olx search: data[] missing");
  return data
    .filter((ad) => !(options.skipOtodomCopies && ad.partner?.code === "otodom_pl"))
    .map((ad) => {
      const listing = parseOlxAd(ad);
      return { id: listing.id, url: listing.url, listing };
    });
}

/**
 * OLX serves its JSON API only to real browsers, so requests run inside a Playwright page on
 * olx.pl (same-origin fetch, exactly what the OLX web app does). One API call per search per poll.
 */
export function createOlxSource(
  session: BrowserSession,
  options: { skipOtodomCopies: boolean },
): ListingSource {
  const resolved = new Map<string, Record<string, unknown>>();

  async function apiUrlFor(searchUrl: string): Promise<string> {
    const { friendlyPath, filters } = splitSearchUrl(searchUrl);
    let ids = resolved.get(friendlyPath);
    if (!ids) {
      const body = (await session.getJson(
        `${ORIGIN}/api/v1/friendly-links/query-params/${friendlyPath}/`,
      )) as { data?: Record<string, unknown> };
      if (!body?.data?.category_id)
        throw new Error(`olx: cannot resolve search path ${friendlyPath}`);
      ids = body.data;
      resolved.set(friendlyPath, ids);
    }
    return buildApiUrl(ids, filters);
  }

  return {
    kind: "olx",
    handles: isOlxUrl,
    open: () => session.open(ORIGIN),
    close: () => session.close(),
    search: async (searchUrl) =>
      parseOlxSearch(await session.getJson(await apiUrlFor(searchUrl)), options),
    details: async (ref) => {
      if (ref.listing) return ref.listing;
      throw new Error(`olx: ${ref.url} has no listing payload`);
    },
  };
}
