import type { CreditInline, LookupAdapter, LookupCandidate, LookupDetail } from "./types";

const API = "https://www.googleapis.com/books/v1";

function yearFromDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

interface Volume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

function toCandidate(v: Volume): LookupCandidate {
  const info = v.volumeInfo ?? {};
  return {
    source: "google_books",
    externalId: v.id,
    title: info.title ?? "(untitled)",
    year: yearFromDate(info.publishedDate),
    releaseDate: info.publishedDate || null,
    posterUrl: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null)?.replace(
      "http://",
      "https://",
    ) ?? null,
    synopsis: info.description || null,
  };
}

export const googleBooksAdapter: LookupAdapter = {
  source: "google_books",

  isConfigured() {
    // Keyless usage is allowed (with lower quota).
    return true;
  },

  async search(env, kind, query, signal) {
    if (kind !== "book") return [];
    const url = new URL(`${API}/volumes`);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "10");
    if (env.GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", env.GOOGLE_BOOKS_API_KEY);
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Volume[] };
    return (data.items ?? []).map(toCandidate);
  },

  async detail(env, kind, externalId, signal) {
    if (kind !== "book") return null;
    const url = new URL(`${API}/volumes/${externalId}`);
    if (env.GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", env.GOOGLE_BOOKS_API_KEY);
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const v = (await res.json()) as Volume;
    const info = v.volumeInfo ?? {};

    const credits: CreditInline[] = [];
    for (const author of info.authors ?? []) {
      credits.push({
        name: author,
        kind: "person",
        role: "author",
        character: null,
        externalIds: null,
      });
    }
    if (info.publisher) {
      credits.push({
        name: info.publisher,
        kind: "studio",
        role: "publisher",
        character: null,
        externalIds: null,
      });
    }

    return { ...toCandidate(v), credits };
  },
};
