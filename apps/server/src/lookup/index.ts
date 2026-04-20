import type { ItemKind, LookupAdapter, LookupSource } from "./types";
import { googleBooksAdapter } from "./google-books";
import { rawgAdapter } from "./rawg";
import { tmdbAdapter } from "./tmdb";

export const ADAPTERS: Record<LookupSource, LookupAdapter> = {
  tmdb: tmdbAdapter,
  google_books: googleBooksAdapter,
  rawg: rawgAdapter,
};

export function adapterForKind(kind: ItemKind): LookupAdapter | null {
  switch (kind) {
    case "movie":
    case "tv":
      return tmdbAdapter;
    case "book":
      return googleBooksAdapter;
    case "game":
      return rawgAdapter;
    default:
      return null;
  }
}

export * from "./types";
