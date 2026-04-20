import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Tag {
  id: number;
  name: string;
  slug: string;
}

export const Route = createFileRoute("/tags")({
  component: TagsPage,
});

function TagsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["tags"],
    queryFn: () => apiFetch<{ tags: Tag[] }>("/tags"),
  });

  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ tag: Tag }>("/tags", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/tags/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["tags"] });
      const prev = queryClient.getQueryData<{ tags: Tag[] }>(["tags"]);
      queryClient.setQueryData<{ tags: Tag[] }>(["tags"], (old) =>
        old ? { tags: old.tags.filter((t) => t.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["tags"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tags"] }),
  });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold">Tags</h1>
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
          placeholder="New tag name…"
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          <Plus /> Add
        </Button>
      </form>
      {data && data.tags.length === 0 && (
        <div className="text-sm text-muted-foreground">
          Free-form labels that apply to both items and articles.
        </div>
      )}
      {data && data.tags.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.tags.map((t) => (
            <li key={t.id} className="flex items-center gap-2 p-2 text-sm">
              <span className="flex-1 font-medium">{t.name}</span>
              <code className="text-xs text-muted-foreground">{t.slug}</code>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(t.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
