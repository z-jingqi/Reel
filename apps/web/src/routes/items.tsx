import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";

interface ItemRow {
  id: number;
  kind: "movie" | "tv" | "book" | "game";
  title: string;
  year: number | null;
  releaseDate: string | null;
  rating: number | null;
  status: string;
  coverUrl: string | null;
}

export const Route = createFileRoute("/items")({
  component: ItemsPage,
});

function ItemsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["items"],
    queryFn: () => apiFetch<{ items: ItemRow[] }>("/items"),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Button asChild>
          <Link to="/items/new">Add</Link>
        </Button>
      </div>
      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      {data && data.items.length === 0 && (
        <div className="text-muted-foreground">
          No items yet. Click <span className="text-foreground">Add</span> to log your first movie,
          show, book, or game.
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className="divide-y divide-border">
          {data.items.map((item) => (
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
                    <span className="inline-flex rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.kind}
                    </span>
                    <span className="truncate font-medium">{item.title}</span>
                    {item.year && (
                      <span className="shrink-0 text-sm text-muted-foreground">({item.year})</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.status}</div>
                </div>
                {item.rating && <span className="pr-2 text-sm text-amber-400">{item.rating}/10</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
