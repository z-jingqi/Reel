import type { CreditInline, LookupAdapter, LookupCandidate, LookupDetail } from "./types";

const API = "https://api.rawg.io/api";

function yearFromDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

interface Game {
  id: number;
  slug?: string;
  name: string;
  released?: string | null;
  background_image?: string | null;
  description_raw?: string;
  description?: string;
  developers?: Array<{ id: number; name: string }>;
  publishers?: Array<{ id: number; name: string }>;
}

function toCandidate(g: Game): LookupCandidate {
  return {
    source: "rawg",
    externalId: String(g.id),
    title: g.name,
    year: yearFromDate(g.released),
    releaseDate: g.released || null,
    posterUrl: g.background_image || null,
    synopsis: (g.description_raw || g.description || "").toString() || null,
  };
}

export const rawgAdapter: LookupAdapter = {
  source: "rawg",

  isConfigured(env) {
    return Boolean(env.RAWG_API_KEY);
  },

  async search(env, kind, query, signal) {
    if (kind !== "game") return [];
    const key = env.RAWG_API_KEY;
    if (!key) return [];
    const url = new URL(`${API}/games`);
    url.searchParams.set("key", key);
    url.searchParams.set("search", query);
    url.searchParams.set("page_size", "10");
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Game[] };
    return (data.results ?? []).map(toCandidate);
  },

  async detail(env, kind, externalId, signal) {
    if (kind !== "game") return null;
    const key = env.RAWG_API_KEY;
    if (!key) return null;
    const url = new URL(`${API}/games/${externalId}`);
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const g = (await res.json()) as Game;

    const credits: CreditInline[] = [];
    for (const d of g.developers ?? []) {
      credits.push({
        name: d.name,
        kind: "studio",
        role: "developer",
        character: null,
        externalIds: { rawg_company: d.id },
      });
    }
    for (const p of g.publishers ?? []) {
      credits.push({
        name: p.name,
        kind: "studio",
        role: "publisher",
        character: null,
        externalIds: { rawg_company: p.id },
      });
    }

    return { ...toCandidate(g), credits };
  },
};
