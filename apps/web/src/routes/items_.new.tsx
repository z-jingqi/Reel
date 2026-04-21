import type { ItemKind } from "@reel/shared";
import { createFileRoute } from "@tanstack/react-router";

import { BookForm } from "../components/item-forms/BookForm";
import { GameForm } from "../components/item-forms/GameForm";
import { MovieForm } from "../components/item-forms/MovieForm";
import { TVForm } from "../components/item-forms/TVForm";

const KINDS = ["movie", "tv", "book", "game"] as const;

export interface NewItemSearch {
  kind: ItemKind;
}

const KIND_TITLES: Record<ItemKind, string> = {
  movie: "New movie",
  tv: "New TV show",
  book: "New book",
  game: "New game",
};

export const Route = createFileRoute("/items_/new")({
  validateSearch: (s: Record<string, unknown>): NewItemSearch => {
    const k = s.kind;
    return { kind: KINDS.includes(k as ItemKind) ? (k as ItemKind) : "movie" };
  },
  component: NewItemPage,
});

function NewItemPage() {
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
