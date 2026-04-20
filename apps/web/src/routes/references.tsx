import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Reference {
  id: number;
  title: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  links: Array<{ id: number; url: string; label: string | null; position: number }>;
}

export const Route = createFileRoute("/references")({
  component: ReferencesPage,
});

function ReferencesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["references"],
    queryFn: () => apiFetch<{ references: Reference[] }>("/references"),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">References</h1>
        <ReferenceDialog />
      </div>
      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      {data && data.references.length === 0 && (
        <div className="text-muted-foreground">
          Reusable citations. Create one to cite it from articles.
        </div>
      )}
      {data && data.references.length > 0 && (
        <ul className="divide-y divide-border">
          {data.references.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.title}</div>
                {r.note && (
                  <div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {r.note}
                  </div>
                )}
                {r.links.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.links.map((link) => (
                      <li key={link.id} className="flex items-center gap-1.5 text-xs">
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {link.label || link.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ReferenceDialog reference={r} />
              <DeleteRefButton id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteRefButton({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiFetch(`/references/${id}`, { method: "DELETE" }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["references"] });
      const prev = queryClient.getQueryData<{ references: Reference[] }>(["references"]);
      queryClient.setQueryData<{ references: Reference[] }>(["references"], (old) =>
        old ? { references: old.references.filter((r) => r.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["references"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["references"] }),
  });
  return (
    <Button size="icon" variant="ghost" onClick={() => del.mutate()} disabled={del.isPending}>
      <Trash2 />
    </Button>
  );
}

function ReferenceDialog({ reference }: { reference?: Reference }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(reference?.title ?? "");
  const [note, setNote] = useState(reference?.note ?? "");
  const [links, setLinks] = useState(
    reference?.links.map((l) => ({ url: l.url, label: l.label ?? "" })) ?? [],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && reference) {
      setTitle(reference.title);
      setNote(reference.note ?? "");
      setLinks(reference.links.map((l) => ({ url: l.url, label: l.label ?? "" })));
    } else if (open && !reference) {
      setTitle("");
      setNote("");
      setLinks([]);
    }
  }, [open, reference]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        note: note || null,
        links: links
          .filter((l) => l.url.trim())
          .map((l) => ({ url: l.url.trim(), label: l.label.trim() || null })),
      };
      if (reference) {
        await apiFetch(`/references/${reference.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/references", { method: "POST", body: JSON.stringify(body) });
      }
      queryClient.invalidateQueries({ queryKey: ["references"] });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {reference ? (
          <Button size="icon" variant="ghost">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> New reference
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{reference ? "Edit reference" : "New reference"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Links</Label>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => setLinks((l) => [...l, { url: "", label: "" }])}
              >
                <Plus /> Add link
              </Button>
            </div>
            {links.length === 0 && (
              <div className="text-xs text-muted-foreground">No links.</div>
            )}
            {links.map((link, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="https://…"
                  value={link.url}
                  onChange={(e) =>
                    setLinks((ls) =>
                      ls.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)),
                    )
                  }
                  className="flex-1"
                />
                <Input
                  placeholder="Label (optional)"
                  value={link.label}
                  onChange={(e) =>
                    setLinks((ls) =>
                      ls.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)),
                    )
                  }
                  className="w-48"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !title.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
