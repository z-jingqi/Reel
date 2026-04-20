import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Category {
  id: number;
  name: string;
  slug: string;
}

export const Route = createFileRoute("/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ categories: Category[] }>("/categories"),
  });

  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ category: Category }>("/categories", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/categories/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["categories"] });
      const prev = queryClient.getQueryData<{ categories: Category[] }>(["categories"]);
      queryClient.setQueryData<{ categories: Category[] }>(["categories"], (old) =>
        old ? { categories: old.categories.filter((c) => c.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["categories"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold">Categories</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
        className="mb-6 flex gap-2"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name…"
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          <Plus /> Add
        </Button>
      </form>
      {data && data.categories.length === 0 && (
        <div className="text-sm text-muted-foreground">
          Curated buckets for articles (e.g. Reviews, Essays, Journal). An article can belong to
          multiple.
        </div>
      )}
      {data && data.categories.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-2 text-sm">
              <span className="flex-1 font-medium">{c.name}</span>
              <code className="text-xs text-muted-foreground">{c.slug}</code>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
