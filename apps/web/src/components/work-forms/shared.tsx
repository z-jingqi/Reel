import type { CreditInline, WorkKind, WorkStatus, LookupDetail } from "@reel/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, X } from "lucide-react";
import { useState } from "react";

import { apiFetch } from "../../api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const STATUSES: { value: WorkStatus; label: string }[] = [
  { value: "wishlist", label: "Wishlist" },
  { value: "active", label: "Active" },
  { value: "finished", label: "Finished" },
  { value: "dropped", label: "Dropped" },
  { value: "paused", label: "Paused" },
];

export interface WorkFormState {
  title: string;
  year: string;
  releaseDate: string;
  rating: string;
  status: WorkStatus;
  coverUrl: string;
  notes: string;
  credits: CreditInline[];
  externalIds: Record<string, string | number> | null;
}

export function initialState(): WorkFormState {
  return {
    title: "",
    year: "",
    releaseDate: "",
    rating: "",
    status: "wishlist",
    coverUrl: "",
    notes: "",
    credits: [],
    externalIds: null,
  };
}

export function applyDetail(state: WorkFormState, detail: LookupDetail): WorkFormState {
  return {
    ...state,
    title: detail.title,
    year: detail.year ? String(detail.year) : "",
    releaseDate: detail.releaseDate ?? "",
    coverUrl: detail.posterUrl ?? "",
    notes: detail.synopsis ?? state.notes,
    credits: detail.credits ?? [],
    externalIds: { [detail.source]: detail.externalId },
  };
}

export function useWorkSubmit(kind: WorkKind) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(state: WorkFormState, overrides?: { hideReleaseDate?: boolean }) {
    setError(null);
    if (!state.title.trim()) {
      setError("Title is required.");
      return false;
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        title: state.title.trim(),
        year: state.year ? Number(state.year) : null,
        releaseDate: overrides?.hideReleaseDate ? null : state.releaseDate || null,
        rating: state.rating ? Number(state.rating) : null,
        status: state.status,
        coverUrl: state.coverUrl || null,
        notes: state.notes || null,
        externalIds: state.externalIds,
        credits: state.credits,
      };
      await apiFetch<{ work: { id: number } }>("/works", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      queryClient.invalidateQueries({ queryKey: ["works"] });
      navigate({ to: "/works", search: { tab: kind } });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, submit };
}

export function StatusField({
  value,
  onChange,
}: {
  value: WorkStatus;
  onChange: (v: WorkStatus) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Status</Label>
      <Select value={value} onValueChange={(v) => onChange(v as WorkStatus)}>
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
  );
}

export function CreditsList({
  credits,
  onRemove,
}: {
  credits: CreditInline[];
  onRemove: (index: number) => void;
}) {
  if (credits.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label>Credits ({credits.length})</Label>
      <ul className="flex flex-wrap gap-2 text-xs">
        {credits.map((c, i) => (
          <li
            key={i}
            className="flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1"
          >
            <span className="text-muted-foreground">{c.role}:</span>
            <span>{c.name}</span>
            {c.character && <span className="text-muted-foreground">as {c.character}</span>}
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(i)}
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormActions({
  saving,
  onCancel,
}: {
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
    </div>
  );
}
