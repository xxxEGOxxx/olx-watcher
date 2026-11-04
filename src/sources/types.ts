import type { Listing } from "../listing.ts";

/** Result of a search page: enough to de-duplicate before fetching details. */
export type ListingRef = {
  /**
   * Stable "<site>:<native id>". OLX copies of otodom ads use the otodom id, so the same flat is
   * sent once whichever site reports it first.
   */
  id: string;
  url: string;
  /** Set when the search response already carries the full ad (OLX API). */
  listing?: Listing;
};

/**
 * One listing site. `search` runs every poll; `details` only for unseen refs without `listing`.
 * `open`/`close` wrap one poll so heavy resources (a browser) live only while polling.
 */
export type ListingSource = {
  readonly kind: string;
  handles(searchUrl: string): boolean;
  search(searchUrl: string): Promise<ListingRef[]>;
  details(ref: ListingRef): Promise<Listing>;
  open?(): Promise<void>;
  close?(): Promise<void>;
};
