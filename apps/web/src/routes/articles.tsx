import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";

interface ArticleRow {
  id: number;
  slug: string;
  title: string;
  pinned: boolean;
  updatedAt: number;
}

export const Route = createFileRoute("/articles")({
  component: ArticlesPage,
});

function ArticlesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["articles"],
    queryFn: () => apiFetch<{ articles: ArticleRow[] }>("/articles"),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Articles</h1>
        <Button asChild>
          <Link to="/articles/new">New article</Link>
        </Button>
      </div>
      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      {data && data.articles.length === 0 && (
        <div className="text-muted-foreground">No articles yet.</div>
      )}
      {data && data.articles.length > 0 && (
        <ul className="divide-y divide-border">
          {data.articles.map((a) => (
            <li key={a.id} className="py-3">
              <Link
                to="/articles/$slug"
                params={{ slug: a.slug }}
                className="font-medium hover:underline"
              >
                {a.pinned && <span className="mr-1 text-foreground/80">★</span>}
                {a.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
