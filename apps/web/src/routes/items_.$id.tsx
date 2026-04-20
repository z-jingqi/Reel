import type { ItemKind, ItemStatus } from "@reel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { apiFetch } from "../api";
import { SeasonsSection } from "../components/seasons-section";
import { TagChipInput } from "../components/tag-chip-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

interface ItemDetail {
  item: {
    id: number;
    kind: ItemKind;
    title: string;
    year: number | null;
    releaseDate: string | null;
    rating: number | null;
    status: ItemStatus;
    notes: string | null;
    coverUrl: string | null;
  };
  credits: Array<{
    id: number;
    role: string;
    character: string | null;
    position: number;
    personId: number;
    personName: string;
    personKind: "person" | "studio";
  }>;
  tagIds: number[];
}

const STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "wishlist", label: "Wishlist" },
  { value: "active", label: "Active" },
  { value: "finished", label: "Finished" },
  { value: "dropped", label: "Dropped" },
  { value: "paused", label: "Paused" },
];

export const Route = createFileRoute("/items_/$id")({
  component: ItemDetailPage,
});

function ItemDetailPage() {
  const { id: idParam } = Route.useParams();
  const id = Number(idParam);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["item", id],
    queryFn: () => apiFetch<ItemDetail>(`/items/${id}`),
  });

  const patch = useMutation({
    mutationFn: (patch: Partial<ItemDetail["item"]> & { tagIds?: number[] }) =>
      apiFetch<{ item: ItemDetail["item"] }>(`/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["item", id] });
      const prev = queryClient.getQueryData<ItemDetail>(["item", id]);
      queryClient.setQueryData<ItemDetail>(["item", id], (old) => {
        if (!old) return old;
        const { tagIds: newTagIds, ...itemPatch } = patch;
        return {
          ...old,
          item: { ...old.item, ...itemPatch },
          tagIds: newTagIds ?? old.tagIds,
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["item", id], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["item", id] }),
  });

  const del = useMutation({
    mutationFn: () => apiFetch(`/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      navigate({ to: "/items" });
    },
  });

  if (query.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!query.data) return <div className="text-muted-foreground">Not found.</div>;

  const { item, credits, tagIds } = query.data;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex gap-6">
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            className="h-48 w-32 shrink-0 rounded border border-border object-cover"
          />
        ) : (
          <div className="h-48 w-32 shrink-0 rounded border border-border bg-secondary" />
        )}
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Badge variant="secondary">{item.kind}</Badge>
            {item.releaseDate && <span>Released {item.releaseDate}</span>}
          </div>
          <h1 className="text-3xl font-semibold">{item.title}</h1>
          {item.year && <div className="text-muted-foreground">{item.year}</div>}

          <div className="flex flex-wrap items-end gap-4 pt-2">
            <div className="w-40 space-y-1.5">
              <Label>Status</Label>
              <Select
                value={item.status}
                onValueChange={(v) => patch.mutate({ status: v as ItemStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32 space-y-1.5">
              <Label>Rating (1–10)</Label>
              <Input
                inputMode="numeric"
                value={item.rating ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  const n = v ? Math.max(1, Math.min(10, Number(v))) : null;
                  patch.mutate({ rating: n });
                }}
              />
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`Delete “${item.title}”? This cannot be undone.`)) {
                  del.mutate();
                }
              }}
              disabled={del.isPending}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>
      </header>

      <section className="space-y-2">
        <Label>Tags</Label>
        <TagChipInput
          selected={tagIds}
          onChange={(ids) => patch.mutate({ tagIds: ids })}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <Label>Notes</Label>
        <NotesEditor
          initial={item.notes ?? ""}
          onSave={(notes) => patch.mutate({ notes: notes || null })}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Credits</h2>
        </div>
        <CreditsList itemId={id} credits={credits} />
      </section>

      {item.kind === "tv" && (
        <>
          <Separator />
          <SeasonsSection itemId={id} />
        </>
      )}
    </div>
  );
}

function NotesEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (notes: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  return (
    <div className="space-y-2">
      <Textarea
        className="min-h-32"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(e.target.value !== initial);
        }}
      />
      {dirty && (
        <Button
          size="sm"
          onClick={() => {
            onSave(value);
            setDirty(false);
          }}
        >
          Save notes
        </Button>
      )}
    </div>
  );
}

function CreditsList({
  itemId,
  credits,
}: {
  itemId: number;
  credits: ItemDetail["credits"];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [character, setCharacter] = useState("");
  const [kind, setKind] = useState<"person" | "studio">("person");
  const [submitting, setSubmitting] = useState(false);

  async function add() {
    if (!name.trim() || !role.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/items/${itemId}/credits`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          character: character.trim() || null,
          kind,
        }),
      });
      setName("");
      setRole("");
      setCharacter("");
      queryClient.invalidateQueries({ queryKey: ["item", itemId] });
    } finally {
      setSubmitting(false);
    }
  }

  const removeCredit = useMutation({
    mutationFn: (creditId: number) =>
      apiFetch(`/items/${itemId}/credits/${creditId}`, { method: "DELETE" }),
    onMutate: async (creditId) => {
      await queryClient.cancelQueries({ queryKey: ["item", itemId] });
      const prev = queryClient.getQueryData<ItemDetail>(["item", itemId]);
      queryClient.setQueryData<ItemDetail>(["item", itemId], (old) =>
        old ? { ...old, credits: old.credits.filter((c) => c.id !== creditId) } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["item", itemId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["item", itemId] }),
  });

  return (
    <div className="space-y-3">
      {credits.length === 0 ? (
        <div className="text-sm text-muted-foreground">No credits yet.</div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {credits.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-2 text-sm">
              <span className="w-24 shrink-0 text-xs uppercase text-muted-foreground">
                {c.role}
              </span>
              <span className="flex-1 truncate">
                {c.personName}
                {c.character && (
                  <span className="text-muted-foreground"> as {c.character}</span>
                )}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeCredit.mutate(c.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-12 gap-2">
        <Input
          className="col-span-4"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          className="col-span-3"
          placeholder="Role (e.g. director)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
        <Input
          className="col-span-3"
          placeholder="Character (optional)"
          value={character}
          onChange={(e) => setCharacter(e.target.value)}
        />
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="col-span-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="person">Person</SelectItem>
            <SelectItem value="studio">Studio</SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="col-span-12"
          onClick={add}
          disabled={submitting || !name.trim() || !role.trim()}
        >
          {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
          Add credit
        </Button>
      </div>
    </div>
  );
}
