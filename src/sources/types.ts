import type { Listing } from "../listing.ts";

/** Cheap result of a search page: enough to de-duplicate before fetching details. */
export type ListingRef = {
  /** Stable "<source>:<native id>". */
  id: string;
  url: string;
};

/**
 * Where listings come from. Search is called every poll; details only for listings not seen
 * before, so each new listing costs one extra request. Both must be safe to retry.
 */
export type ListingSource = {
  readonly kind: string;
  search(searchUrl: string): Promise<ListingRef[]>;
  details(ref: ListingRef): Promise<Listing>;
};
