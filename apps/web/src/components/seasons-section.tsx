import type { ItemStatus } from "@reel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Season {
  id: number;
  itemId: number;
  number: number;
  title: string | null;
  year: number | null;
  rating: number | null;
  status: ItemStatus;
  notes: string | null;
  completedAt: number | null;
}

const STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "wishlist", label: "Wishlist" },
  { value: "active", label: "Active" },
  { value: "finished", label: "Finished" },
  { value: "dropped", label: "Dropped" },
  { value: "paused", label: "Paused" },
];

export function SeasonsSection({ itemId }: { itemId: number }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["seasons", itemId],
    queryFn: () => apiFetch<{ seasons: Season[] }>(`/seasons?itemId=${itemId}`),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/seasons/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["seasons", itemId] });
      const prev = queryClient.getQueryData<{ seasons: Season[] }>(["seasons", itemId]);
      queryClient.setQueryData<{ seasons: Season[] }>(["seasons", itemId], (old) =>
        old ? { seasons: old.seasons.filter((s) => s.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["seasons", itemId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["seasons", itemId] }),
  });

  const seasons = data?.seasons ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Seasons</h2>
        <NewSeasonDialog itemId={itemId} nextNumber={nextSeasonNumber(seasons)} />
      </div>

      {seasons.length === 0 ? (
        <div className="text-sm text-muted-foreground">No seasons logged yet.</div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {seasons.map((s) => (
            <li key={s.id} className="flex items-start gap-4 p-3 text-sm">
              <div className="w-16 shrink-0 text-center">
                <div className="text-xs uppercase text-muted-foreground">Season</div>
                <div className="text-xl font-semibold">{s.number}</div>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {s.title && <div className="font-medium">{s.title}</div>}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{s.status}</span>
                  {s.year && <span>· {s.year}</span>}
                  {s.rating && <span>· {s.rating}/10</span>}
                </div>
                {s.notes && (
                  <div className="line-clamp-3 text-xs text-muted-foreground">{s.notes}</div>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(s.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function nextSeasonNumber(seasons: Season[]): number {
  if (!seasons.length) return 1;
  return Math.max(...seasons.map((s) => s.number)) + 1;
}

function NewSeasonDialog({ itemId, nextNumber }: { itemId: number; nextNumber: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(String(nextNumber));
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [rating, setRating] = useState("");
  const [status, setStatus] = useState<ItemStatus>("wishlist");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setNumber(String(nextNumber));
    setTitle("");
    setYear("");
    setRating("");
    setStatus("wishlist");
    setNotes("");
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/seasons", {
        method: "POST",
        body: JSON.stringify({
          itemId,
          number: Number(number) || 0,
          title: title || null,
          year: year ? Number(year) : null,
          rating: rating ? Number(rating) : null,
          status,
          notes: notes || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["seasons", itemId] });
      setOpen(false);
      reset();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setNumber(String(nextNumber));
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Season
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add season</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Number</Label>
            <Input
              inputMode="numeric"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ItemStatus)}>
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
        </div>
        <div className="space-y-2">
          <Label>Title (optional)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Year</Label>
            <Input
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label>Rating (1–10)</Label>
            <Input
              inputMode="numeric"
              value={rating}
              onChange={(e) => setRating(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
