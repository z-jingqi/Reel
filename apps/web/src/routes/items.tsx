import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

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

interface ItemRow {
  id: number;
  kind: Kind;
  title: string;
  year: number | null;
  releaseDate: string | null;
  rating: number | null;
  status: string;
  coverUrl: string | null;
}

export interface ItemsSearch {
  tab: Kind;
}

export const Route = createFileRoute("/items")({
  validateSearch: (s: Record<string, unknown>): ItemsSearch => {
    const t = s.tab;
    return { tab: KINDS.includes(t as Kind) ? (t as Kind) : "movie" };
  },
  component: ItemsPage,
});

function ItemsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/items" });

  const { data, isLoading } = useQuery({
    queryKey: ["items", tab],
    queryFn: () => apiFetch<{ items: ItemRow[] }>(`/items?kind=${tab}`),
  });

  const items = data?.items ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Media</h1>
        <Button asChild>
          <Link to="/items/new" search={{ kind: tab }}>
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
      {!isLoading && items.length === 0 && (
        <div className="text-sm text-muted-foreground">
          No {KIND_LABELS[tab].toLowerCase()} yet.
        </div>
      )}
      {items.length > 0 && (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to="/items/$id"
                params={{ id: String(item.id) }}
                className="flex items-center gap-3 py-3 hover:bg-accent/30"
              >
                {item.coverUrl ? (
                  <img
                    src={item.coverUrl}
                    alt=""
                    className="h-14 w-10 shrink-0 rounded border border-border object-cover"
                  />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded border border-border bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-medium">{item.title}</span>
                    {item.year && (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        ({item.year})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.status}</div>
                </div>
                {item.rating && (
                  <span className="pr-2 text-sm text-muted-foreground">{item.rating}/10</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
