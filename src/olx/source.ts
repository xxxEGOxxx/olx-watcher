import type { SourceKind } from "../config.ts";
import type { Listing } from "../listing.ts";

/**
 * Where listings come from. OLX answers plain HTTP clients with a CloudFront 403 (both from the
 * Hetzner server and from home), so the access method is an open product decision — see
 * docs/olx-access.md. Add a new kind here plus its SourceKind in config.ts; keep normalization to
 * `Listing` inside the source so the rest of the app stays source-agnostic.
 */
export type ListingSource = {
  readonly kind: SourceKind;
  /** Newest listings for one saved search, newest first. Must be safe to call repeatedly. */
  fetchLatest(searchUrl: string): Promise<Listing[]>;
};

export function createSource(kind: SourceKind): ListingSource {
  switch (kind) {
    case "none":
      return { kind, fetchLatest: async () => [] };
  }
}
