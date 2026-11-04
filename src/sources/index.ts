import type { SourceKind } from "../config.ts";
import { createFetchHtml } from "./http.ts";
import { createOtodomSource } from "./otodom.ts";
import type { ListingSource } from "./types.ts";

export function createSource(kind: SourceKind): ListingSource {
  switch (kind) {
    case "none":
      return {
        kind,
        search: async () => [],
        details: async () => {
          throw new Error("source none has no details");
        },
      };
    case "otodom":
      return createOtodomSource(createFetchHtml());
  }
}
