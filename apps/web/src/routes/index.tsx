import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="mb-3 text-3xl font-semibold">Welcome to Reel</h1>
      <p className="text-muted-foreground">
        A private journal for movies, TV shows, books, and video games — plus articles you
        write about them, with an AI writing assistant on call.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Start by adding an item to your library or drafting an article.
      </p>
    </div>
  );
}
