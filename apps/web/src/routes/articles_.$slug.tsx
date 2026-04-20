import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { apiFetch } from "../api";
import { ArticleEditor } from "../components/article-editor";

interface ArticleDetail {
  article: {
    id: number;
    slug: string;
    title: string;
    bodyJson: string;
    bodyText: string;
    pinned: boolean;
  };
  itemIds: number[];
  categoryIds: number[];
  tagIds: number[];
}

export const Route = createFileRoute("/articles_/$slug")({
  component: ArticleDetailPage,
});

function ArticleDetailPage() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["article", slug],
    queryFn: () => apiFetch<ArticleDetail>(`/articles/${slug}`),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Not found.</div>;

  return (
    <ArticleEditor
      initial={{
        id: data.article.id,
        title: data.article.title,
        slug: data.article.slug,
        bodyJson: data.article.bodyJson,
        pinned: data.article.pinned,
        itemIds: data.itemIds,
        categoryIds: data.categoryIds,
        tagIds: data.tagIds,
      }}
    />
  );
}
