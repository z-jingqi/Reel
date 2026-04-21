import type { ItemKind, LookupCandidate, LookupDetail } from "@reel/shared";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Sources {
  tmdb: boolean;
  google_books: boolean;
  rawg: boolean;
}

const KIND_SOURCE: Record<ItemKind, keyof Sources> = {
  movie: "tmdb",
  tv: "tmdb",
  book: "google_books",
  game: "rawg",
};

export function LookupSearch({
  kind,
  onPick,
}: {
  kind: ItemKind;
  onPick: (detail: LookupDetail) => void;
}) {
  const { data: sourcesData, isLoading: sourcesLoading } = useQuery({
    queryKey: ["lookup-sources"],
    queryFn: () => apiFetch<{ sources: Sources }>("/lookup/sources"),
    staleTime: 5 * 60 * 1000,
  });

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<LookupCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [fetchingDetail, setFetchingDetail] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const enabled = sourcesData ? sourcesData.sources[KIND_SOURCE[kind]] : null;

  useEffect(() => {
    setQuery("");
    setCandidates([]);
  }, [kind]);

  useEffect(() => {
    if (!enabled || query.trim().length < 2) {
      setCandidates([]);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/lookup/${kind}?q=${encodeURIComponent(query.trim())}`,
          { signal: ctrl.signal, credentials: "include" },
        );
        if (!res.ok) {
          setCandidates([]);
          return;
        }
        const data = (await res.json()) as { candidates: LookupCandidate[] };
        setCandidates(data.candidates);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setCandidates([]);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, kind, enabled]);

  async function pick(candidate: LookupCandidate) {
    setFetchingDetail(candidate.externalId);
    try {
      const { detail } = await apiFetch<{ detail: LookupDetail }>(
        `/lookup/${kind}/${encodeURIComponent(candidate.externalId)}`,
      );
      onPick(detail);
      setCandidates([]);
      setQuery("");
    } catch {
      onPick({ ...candidate, credits: [] });
      setCandidates([]);
      setQuery("");
    } finally {
      setFetchingDetail(null);
    }
  }

  if (sourcesLoading || enabled === false) return null;

  const placeholderKind =
    kind === "tv" ? "TV show" : kind === "movie" ? "movie" : kind === "book" ? "book" : "game";

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        Auto-fill from source
      </Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={`Search for a ${placeholderKind}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {candidates.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {candidates.map((c) => (
            <li key={c.externalId}>
              <button
                type="button"
                onClick={() => pick(c)}
                disabled={fetchingDetail === c.externalId}
                className="flex w-full items-center gap-3 p-2 text-left hover:bg-accent disabled:opacity-60"
              >
                {c.posterUrl ? (
                  <img
                    src={c.posterUrl}
                    alt=""
                    className="h-14 w-10 shrink-0 rounded border border-border object-cover"
                  />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded border border-border bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.title}</div>
                  {c.year && <div className="text-xs text-muted-foreground">{c.year}</div>}
                  {c.synopsis && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {c.synopsis}
                    </div>
                  )}
                </div>
                {fetchingDetail === c.externalId && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
