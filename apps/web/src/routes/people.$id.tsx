import type { ItemKind } from "@reel/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { apiFetch } from "../api";
import { Badge } from "@/components/ui/badge";

interface PersonCredit {
  creditId: number;
  itemId: number;
  kind: ItemKind;
  title: string;
  year: number | null;
  coverUrl: string | null;
  role: string;
  character: string | null;
  position: number;
}

interface PersonDetail {
  person: {
    id: number;
    name: string;
    kind: "person" | "studio";
    externalIds: Record<string, string | number> | null;
  };
  credits: PersonCredit[];
}

const KIND_GROUP_TITLES: Record<ItemKind, string> = {
  movie: "Movies",
  tv: "TV shows",
  book: "Books",
  game: "Games",
};

const KIND_ORDER: ItemKind[] = ["movie", "tv", "book", "game"];

export const Route = createFileRoute("/people/$id")({
  component: PersonPage,
});

function PersonPage() {
  const { id: idParam } = Route.useParams();
  const id = Number(idParam);

  const { data, isLoading } = useQuery({
    queryKey: ["person", id],
    queryFn: () => apiFetch<PersonDetail>(`/people/${id}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-muted-foreground">Not found.</div>;

  const { person, credits } = data;
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
          {credits.length} {credits.length === 1 ? "credit" : "credits"}
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
                  to="/items/$id"
                  params={{ id: String(c.itemId) }}
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
    </div>
  );
}
