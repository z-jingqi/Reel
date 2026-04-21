import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";

interface ArticleRow {
  id: number;
  slug: string;
  title: string;
  pinned: boolean;
  updatedAt: string | number;
}

interface ArticlePage {
  articles: ArticleRow[];
  nextOffset: number | null;
}

const PAGE_SIZE = 20;

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["articles", "infinite"] as const,
    initialPageParam: 0 as number,
    queryFn: ({ pageParam }) =>
      apiFetch<ArticlePage>(`/articles?offset=${pageParam}&limit=${PAGE_SIZE}`),
    getNextPageParam: (last: ArticlePage) => last.nextOffset,
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

  const articles = data?.pages.flatMap((p) => p.articles) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Articles</h1>
        <Button asChild>
          <Link to="/articles/new">New article</Link>
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && articles.length === 0 && (
        <div className="text-sm text-muted-foreground">No articles yet.</div>
      )}

      {articles.length > 0 && (
        <ul className="divide-y divide-border">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                to="/articles/$slug"
                params={{ slug: a.slug }}
                className="flex items-center gap-3 px-2 py-3 -mx-2 rounded-md transition-colors hover:bg-accent/50"
              >
                {a.pinned && <span className="text-foreground/70">★</span>}
                <span className="flex-1 truncate font-medium">{a.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelative(a.updatedAt)}
                </span>
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

function formatRelative(ts: string | number): string {
  const then = typeof ts === "number" ? ts : new Date(ts).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}
