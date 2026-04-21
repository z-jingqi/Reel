import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { LookupSearch } from "../lookup-search";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CreditsList,
  FormActions,
  StatusField,
  applyDetail,
  initialState,
  useWorkSubmit,
  type WorkFormState,
} from "./shared";

export function MovieForm() {
  const navigate = useNavigate();
  const [state, setState] = useState<WorkFormState>(initialState);
  const { saving, error, submit } = useWorkSubmit("movie");

  function update<K extends keyof WorkFormState>(key: K, value: WorkFormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(state);
      }}
      className="space-y-5"
    >
      <LookupSearch kind="movie" onPick={(detail) => setState((s) => applyDetail(s, detail))} />

      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={state.title} onChange={(e) => update("title", e.target.value)} required />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Release date</Label>
          <Input
            placeholder="YYYY-MM-DD"
            value={state.releaseDate}
            onChange={(e) => update("releaseDate", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Year</Label>
          <Input
            inputMode="numeric"
            value={state.year}
            onChange={(e) => update("year", e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label>Rating (1–10)</Label>
          <Input
            inputMode="numeric"
            value={state.rating}
            onChange={(e) => update("rating", e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>

      <StatusField value={state.status} onChange={(v) => update("status", v)} />

      <div className="space-y-2">
        <Label>Poster URL</Label>
        <Input value={state.coverUrl} onChange={(e) => update("coverUrl", e.target.value)} />
        {state.coverUrl && (
          <img
            src={state.coverUrl}
            alt=""
            className="mt-2 h-40 w-auto rounded border border-border object-cover"
          />
        )}
      </div>

      <div className="space-y-2">
        <Label>Synopsis</Label>
        <Textarea
          className="min-h-32"
          value={state.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </div>

      <CreditsList
        credits={state.credits}
        onRemove={(i) =>
          setState((s) => ({ ...s, credits: s.credits.filter((_, j) => j !== i) }))
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <FormActions saving={saving} onCancel={() => navigate({ to: "/works", search: { tab: "movie" } })} />
    </form>
  );
}
