import type { Config } from "../config.ts";
import { createBrowserSession } from "./browser.ts";
import { createFetchHtml } from "./http.ts";
import { createOlxSource } from "./olx.ts";
import { createOtodomSource } from "./otodom.ts";
import type { ListingSource } from "./types.ts";

/** The sources this runner polls, in `SOURCES` order. */
export function createSources(
  config: Pick<Config, "sources" | "skipOtodomCopies">,
): ListingSource[] {
  return config.sources.map((kind) =>
    kind === "olx"
      ? createOlxSource(createBrowserSession(), { skipOtodomCopies: config.skipOtodomCopies })
      : createOtodomSource(createFetchHtml()),
  );
}
