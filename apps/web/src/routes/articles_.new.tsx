import { createFileRoute } from "@tanstack/react-router";

import { ArticleEditor } from "../components/article-editor";

export const Route = createFileRoute("/articles_/new")({
  component: NewArticlePage,
});

function NewArticlePage() {
  return <ArticleEditor />;
}
