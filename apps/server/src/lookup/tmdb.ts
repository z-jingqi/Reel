import type {
  CreditInline,
  ItemKind,
  LookupAdapter,
  LookupCandidate,
  LookupDetail,
} from "./types";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w500";

// Role display -> normalized.
function normalizeRole(raw: string): string {
  return raw.toLowerCase();
}

function yearFromDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export const tmdbAdapter: LookupAdapter = {
  source: "tmdb",

  isConfigured(env) {
    return Boolean(env.TMDB_API_KEY);
  },

  async search(env, kind, query, signal) {
    if (kind !== "movie" && kind !== "tv") return [];
    const key = env.TMDB_API_KEY;
    if (!key) return [];
    const url = new URL(`${API}/search/${kind}`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("query", query);
    url.searchParams.set("include_adult", "false");
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        id: number;
        title?: string;
        name?: string;
        release_date?: string;
        first_air_date?: string;
        poster_path?: string | null;
        overview?: string;
      }>;
    };
    return (data.results ?? []).slice(0, 10).map<LookupCandidate>((r) => {
      const date = kind === "movie" ? r.release_date : r.first_air_date;
      return {
        source: "tmdb",
        externalId: String(r.id),
        title: (kind === "movie" ? r.title : r.name) ?? "(untitled)",
        year: yearFromDate(date),
        releaseDate: date || null,
        posterUrl: r.poster_path ? `${IMG}${r.poster_path}` : null,
        synopsis: r.overview || null,
      };
    });
  },

  async detail(env, kind, externalId, signal) {
    if (kind !== "movie" && kind !== "tv") return null;
    const key = env.TMDB_API_KEY;
    if (!key) return null;
    const url = new URL(`${API}/${kind}/${externalId}`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("append_to_response", "credits");
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id: number;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      overview?: string;
      networks?: Array<{ id: number; name: string }>;
      production_companies?: Array<{ id: number; name: string }>;
      created_by?: Array<{ id: number; name: string }>;
      credits?: {
        cast?: Array<{ id: number; name: string; character?: string }>;
        crew?: Array<{ id: number; name: string; job: string; department: string }>;
      };
    };

    const credits: CreditInline[] = [];

    // Crew (director, writer, etc.)
    const crew = data.credits?.crew ?? [];
    const keepJobs = new Set([
      "Director",
      "Writer",
      "Screenplay",
      "Novel",
      "Story",
      "Producer",
      "Executive Producer",
      "Original Music Composer",
      "Director of Photography",
      "Editor",
    ]);
    for (const c of crew) {
      if (!keepJobs.has(c.job)) continue;
      credits.push({
        name: c.name,
        kind: "person",
        role: normalizeRole(c.job),
        character: null,
        externalIds: { tmdb_person: c.id },
      });
    }

    // Creators (TV only)
    for (const c of data.created_by ?? []) {
      credits.push({
        name: c.name,
        kind: "person",
        role: "creator",
        character: null,
        externalIds: { tmdb_person: c.id },
      });
    }

    // Cast (top 10)
    const cast = data.credits?.cast ?? [];
    for (const c of cast.slice(0, 10)) {
      credits.push({
        name: c.name,
        kind: "person",
        role: "cast",
        character: c.character || null,
        externalIds: { tmdb_person: c.id },
      });
    }

    // Production companies / networks as studios.
    for (const s of data.production_companies ?? []) {
      credits.push({
        name: s.name,
        kind: "studio",
        role: "studio",
        character: null,
        externalIds: { tmdb_company: s.id },
      });
    }
    for (const n of data.networks ?? []) {
      credits.push({
        name: n.name,
        kind: "studio",
        role: "network",
        character: null,
        externalIds: { tmdb_network: n.id },
      });
    }

    const date = kind === "movie" ? data.release_date : data.first_air_date;

    const detail: LookupDetail = {
      source: "tmdb",
      externalId: String(data.id),
      title: (kind === "movie" ? data.title : data.name) ?? "(untitled)",
      year: yearFromDate(date),
      releaseDate: date || null,
      posterUrl: data.poster_path ? `${IMG}${data.poster_path}` : null,
      synopsis: data.overview || null,
      credits,
    };
    return detail;
  },
};
