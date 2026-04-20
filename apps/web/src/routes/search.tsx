import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface ItemHit {
  id: number;
  kind: "movie" | "tv" | "book" | "game";
  title: string;
  year: number | null;
  rating: number | null;
  coverUrl: string | null;
}

interface ArticleHit {
  id: number;
  slug: string;
  title: string;
  updatedAt: number;
}

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

function SearchPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);

  const { data } = useQuery({
    enabled: query.length > 0,
    queryKey: ["search", query],
    queryFn: () =>
      apiFetch<{ items: ItemHit[]; articles: ArticleHit[] }>(
        `/search?q=${encodeURIComponent(query)}`,
      ),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-9"
          placeholder="Search items and articles…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>

      {query.length === 0 && (
        <div className="text-sm text-muted-foreground">
          Type to search titles and notes across your library and articles.
        </div>
      )}

      {data && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">
              Items ({data.items.length})
            </h2>
            {data.items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No items matched.</div>
            ) : (
              <ul className="divide-y divide-border">
                {data.items.map((i) => (
                  <li key={i.id}>
                    <Link
                      to="/items/$id"
                      params={{ id: String(i.id) }}
                      className="flex items-center gap-3 py-2 hover:bg-accent/30"
                    >
                      {i.coverUrl ? (
                        <img
                          src={i.coverUrl}
                          alt=""
                          className="h-12 w-8 rounded border border-border object-cover"
                        />
                      ) : (
                        <div className="h-12 w-8 rounded border border-border bg-secondary" />
                      )}
                      <Badge variant="secondary">{i.kind}</Badge>
                      <span className="flex-1 truncate">{i.title}</span>
                      {i.year && <span className="text-sm text-muted-foreground">{i.year}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">
              Articles ({data.articles.length})
            </h2>
            {data.articles.length === 0 ? (
              <div className="text-sm text-muted-foreground">No articles matched.</div>
            ) : (
              <ul className="divide-y divide-border">
                {data.articles.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/articles/$slug"
                      params={{ slug: a.slug }}
                      className="flex items-center py-2 hover:bg-accent/30"
                    >
                      <span className="font-medium">{a.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
