import type { WorkKind } from "@reel/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { apiFetch } from "../api";
import { Badge } from "@/components/ui/badge";

interface PersonCredit {
  creditId: number;
  workId: number;
  kind: WorkKind;
  title: string;
  year: number | null;
  coverUrl: string | null;
  role: string;
  character: string | null;
  position: number;
}

interface PersonPage {
  person: {
    id: number;
    name: string;
    kind: "person" | "studio";
    externalIds: Record<string, string | number> | null;
  };
  credits: PersonCredit[];
  nextOffset: number | null;
}

const KIND_GROUP_TITLES: Record<WorkKind, string> = {
  movie: "Movies",
  tv: "TV shows",
  book: "Books",
  game: "Games",
};

const KIND_ORDER: WorkKind[] = ["movie", "tv", "book", "game"];

const PAGE_SIZE = 20;

export const Route = createFileRoute("/people/$id")({
  component: PersonPage,
});

function PersonPage() {
  const { id: idParam } = Route.useParams();
  const id = Number(idParam);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["person", "infinite", id] as const,
    initialPageParam: 0 as number,
    queryFn: ({ pageParam }) =>
      apiFetch<PersonPage>(`/people/${id}?offset=${pageParam}&limit=${PAGE_SIZE}`),
    getNextPageParam: (last: PersonPage) => last.nextOffset,
  });

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

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data || data.pages.length === 0) {
    return <div className="text-muted-foreground">Not found.</div>;
  }

  const person = data.pages[0]!.person;
  const credits = data.pages.flatMap((p) => p.credits);
  const byKind = KIND_ORDER.map(
    (k) => [k, credits.filter((c) => c.kind === k)] as const,
  ).filter(([, list]) => list.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Badge variant="secondary">{person.kind}</Badge>
        </div>
        <h1 className="text-3xl font-semibold">{person.name}</h1>
        <div className="text-sm text-muted-foreground">
          {credits.length}
          {hasNextPage ? "+" : ""} {credits.length === 1 ? "credit" : "credits"}
        </div>
      </header>

      {credits.length === 0 && (
        <div className="text-sm text-muted-foreground">No credits yet for this person.</div>
      )}

      {byKind.map(([kind, list]) => (
        <section key={kind} className="space-y-3">
          <h2 className="text-lg font-semibold">{KIND_GROUP_TITLES[kind]}</h2>
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.map((c) => (
              <li key={c.creditId}>
                <Link
                  to="/works/$id"
                  params={{ id: String(c.workId) }}
                  className="flex items-center gap-3 p-2 hover:bg-accent/40"
                >
                  {c.coverUrl ? (
                    <img
                      src={c.coverUrl}
                      alt=""
                      className="h-14 w-10 shrink-0 rounded border border-border object-cover"
                    />
                  ) : (
                    <div className="h-14 w-10 shrink-0 rounded border border-border bg-secondary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-medium">{c.title}</span>
                      {c.year && (
                        <span className="shrink-0 text-sm text-muted-foreground">
                          ({c.year})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.role}
                      {c.character && <span> as {c.character}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div ref={sentinelRef} className="h-8" />
      {isFetchingNextPage && (
        <div className="py-4 text-center text-xs text-muted-foreground">Loading more…</div>
      )}
    </div>
  );
}
