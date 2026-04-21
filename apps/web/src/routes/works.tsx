import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const KINDS = ["movie", "tv", "book", "game"] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABELS: Record<Kind, string> = {
  movie: "Movies",
  tv: "TV Shows",
  book: "Books",
  game: "Games",
};

const KIND_SINGULAR: Record<Kind, string> = {
  movie: "movie",
  tv: "TV show",
  book: "book",
  game: "game",
};

interface WorkRow {
  id: number;
  kind: Kind;
  title: string;
  year: number | null;
  releaseDate: string | null;
  rating: number | null;
  status: string;
  coverUrl: string | null;
}

interface WorkPage {
  works: WorkRow[];
  nextOffset: number | null;
}

const PAGE_SIZE = 20;

export interface WorksSearch {
  tab: Kind;
}

export const Route = createFileRoute("/works")({
  validateSearch: (s: Record<string, unknown>): WorksSearch => {
    const t = s.tab;
    return { tab: KINDS.includes(t as Kind) ? (t as Kind) : "movie" };
  },
  component: WorksPage,
});

function WorksPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/works" });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["works", "infinite", tab] as const,
    initialPageParam: 0 as number,
    queryFn: ({ pageParam }) =>
      apiFetch<WorkPage>(`/works?kind=${tab}&offset=${pageParam}&limit=${PAGE_SIZE}`),
    getNextPageParam: (last: WorkPage) => last.nextOffset,
  });

  const works = data?.pages.flatMap((p) => p.works) ?? [];

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Button asChild>
          <Link to="/works/new" search={{ kind: tab }}>
            New {KIND_SINGULAR[tab]}
          </Link>
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as Kind } })}
        className="mb-4"
      >
        <TabsList>
          {KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {KIND_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      {!isLoading && works.length === 0 && (
        <div className="text-sm text-muted-foreground">
          No {KIND_LABELS[tab].toLowerCase()} yet.
        </div>
      )}
      {works.length > 0 && (
        <ul className="divide-y divide-border">
          {works.map((w) => (
            <li key={w.id}>
              <Link
                to="/works/$id"
                params={{ id: String(w.id) }}
                className="flex items-center gap-3 py-3 hover:bg-accent/30"
              >
                {w.coverUrl ? (
                  <img
                    src={w.coverUrl}
                    alt=""
                    className="h-14 w-10 shrink-0 rounded border border-border object-cover"
                  />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded border border-border bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-medium">{w.title}</span>
                    {w.year && (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        ({w.year})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{w.status}</div>
                </div>
                {w.rating && (
                  <span className="pr-2 text-sm text-muted-foreground">{w.rating}/10</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinelRef} className="h-8" />
      {isFetchingNextPage && (
        <div className="py-4 text-center text-xs text-muted-foreground">Loading more…</div>
      )}
    </div>
  );
}
