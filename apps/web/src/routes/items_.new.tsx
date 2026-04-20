import type {
  CreditInline,
  ItemKind,
  ItemStatus,
  LookupCandidate,
  LookupDetail,
} from "@reel/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../api";
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
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/items_/new")({
  component: NewItemPage,
});

const KINDS: { value: ItemKind; label: string }[] = [
  { value: "movie", label: "Movie" },
  { value: "tv", label: "TV show" },
  { value: "book", label: "Book" },
  { value: "game", label: "Game" },
];

const STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "wishlist", label: "Wishlist" },
  { value: "active", label: "Active" },
  { value: "finished", label: "Finished" },
  { value: "dropped", label: "Dropped" },
  { value: "paused", label: "Paused" },
];

function NewItemPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<ItemKind>("movie");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState<string>("");
  const [releaseDate, setReleaseDate] = useState("");
  const [rating, setRating] = useState<string>("");
  const [status, setStatus] = useState<ItemStatus>("wishlist");
  const [coverUrl, setCoverUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [credits, setCredits] = useState<CreditInline[]>([]);
  const [externalIds, setExternalIds] = useState<Record<string, string | number> | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyDetail(detail: LookupDetail) {
    setTitle(detail.title);
    setYear(detail.year ? String(detail.year) : "");
    setReleaseDate(detail.releaseDate ?? "");
    setCoverUrl(detail.posterUrl ?? "");
    if (detail.synopsis) setNotes(detail.synopsis);
    setCredits(detail.credits ?? []);
    setExternalIds({ [detail.source]: detail.externalId });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        title: title.trim(),
        year: year ? Number(year) : null,
        releaseDate: releaseDate || null,
        rating: rating ? Number(rating) : null,
        status,
        coverUrl: coverUrl || null,
        notes: notes || null,
        externalIds,
        credits,
      };
      await apiFetch<{ item: { id: number } }>("/items", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      navigate({ to: "/items" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Add to library</h1>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ItemKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        <LookupSearch kind={kind} onPick={applyDetail} />

        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Year</Label>
            <Input
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label>Release date</Label>
            <Input
              placeholder="YYYY-MM-DD"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
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
          <Label>Cover URL</Label>
          <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
          {coverUrl && (
            <img
              src={coverUrl}
              alt=""
              className="mt-2 h-40 w-auto rounded border border-border object-cover"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>Notes / synopsis</Label>
          <Textarea
            className="min-h-32"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {credits.length > 0 && (
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
                    onClick={() => setCredits((list) => list.filter((_, j) => j !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/items" })}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function LookupSearch({
  kind,
  onPick,
}: {
  kind: ItemKind;
  onPick: (detail: LookupDetail) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<LookupCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [fetchingDetail, setFetchingDetail] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset when kind changes.
  useEffect(() => {
    setQuery("");
    setCandidates([]);
    setDisabled(false);
  }, [kind]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setCandidates([]);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/lookup/${kind}?q=${encodeURIComponent(query.trim())}`,
          { signal: ctrl.signal, credentials: "include" },
        );
        if (!res.ok) {
          setCandidates([]);
          return;
        }
        const data = (await res.json()) as {
          candidates: LookupCandidate[];
          disabled?: boolean;
        };
        setDisabled(Boolean(data.disabled));
        setCandidates(data.candidates);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setCandidates([]);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, kind]);

  async function pick(candidate: LookupCandidate) {
    setFetchingDetail(candidate.externalId);
    try {
      const { detail } = await apiFetch<{ detail: LookupDetail }>(
        `/lookup/${kind}/${encodeURIComponent(candidate.externalId)}`,
      );
      onPick(detail);
      setCandidates([]);
      setQuery("");
    } catch {
      // Fall back to applying the candidate's basic data only.
      onPick({ ...candidate, credits: [] });
      setCandidates([]);
      setQuery("");
    } finally {
      setFetchingDetail(null);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        Auto-fill from source
      </Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={
            disabled
              ? "Auto-fill disabled (API key not configured)"
              : `Search for a ${kind === "tv" ? "TV show" : kind}…`
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {candidates.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {candidates.map((c) => (
            <li key={c.externalId}>
              <button
                type="button"
                onClick={() => pick(c)}
                disabled={fetchingDetail === c.externalId}
                className="flex w-full items-center gap-3 p-2 text-left hover:bg-accent disabled:opacity-60"
              >
                {c.posterUrl ? (
                  <img
                    src={c.posterUrl}
                    alt=""
                    className="h-14 w-10 shrink-0 rounded border border-border object-cover"
                  />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded border border-border bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.title}</div>
                  {c.year && <div className="text-xs text-muted-foreground">{c.year}</div>}
                  {c.synopsis && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {c.synopsis}
                    </div>
                  )}
                </div>
                {fetchingDetail === c.externalId && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
