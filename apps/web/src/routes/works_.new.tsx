import type { WorkKind } from "@reel/shared";
import { createFileRoute } from "@tanstack/react-router";

import { BookForm } from "../components/work-forms/BookForm";
import { GameForm } from "../components/work-forms/GameForm";
import { MovieForm } from "../components/work-forms/MovieForm";
import { TVForm } from "../components/work-forms/TVForm";

const KINDS = ["movie", "tv", "book", "game"] as const;

export interface NewWorkSearch {
  kind: WorkKind;
}

const KIND_TITLES: Record<WorkKind, string> = {
  movie: "New movie",
  tv: "New TV show",
  book: "New book",
  game: "New game",
};

export const Route = createFileRoute("/works_/new")({
  validateSearch: (s: Record<string, unknown>): NewWorkSearch => {
    const k = s.kind;
    return { kind: KINDS.includes(k as WorkKind) ? (k as WorkKind) : "movie" };
  },
  component: NewWorkPage,
});

function NewWorkPage() {
  const { kind } = Route.useSearch();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">{KIND_TITLES[kind]}</h1>
      {kind === "movie" && <MovieForm />}
      {kind === "tv" && <TVForm />}
      {kind === "book" && <BookForm />}
      {kind === "game" && <GameForm />}
    </div>
  );
}
