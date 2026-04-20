import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type Provider =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "openrouter"
  | "cloudflare";

const ALL_PROVIDERS: Provider[] = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "openrouter",
  "cloudflare",
];

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ProvidersSection />
      <Separator />
      <ModelPickers />
      <Separator />
      <MemoriesSection />
    </div>
  );
}

function ProvidersSection() {
  const { data } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiFetch<{ providers: Provider[] }>("/config/providers"),
  });
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">AI providers</h2>
      {data?.providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No providers configured. Add a key to <code>.dev.vars</code> (or Worker secrets in prod)
          and reload.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {(data?.providers ?? []).map((p) => (
            <li
              key={p}
              className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs"
            >
              {p}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MODEL_KEYS = [
  { key: "model:writing" as const, label: "Writing assistant" },
  { key: "model:chat" as const, label: "Chat over article" },
  { key: "model:default" as const, label: "Default fallback" },
];

function ModelPickers() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Model selection</h2>
        <p className="text-sm text-muted-foreground">
          Choose which provider + model ID to use per feature. Persists per-user.
        </p>
      </div>
      {MODEL_KEYS.map(({ key, label }) => (
        <ModelRow key={key} configKey={key} label={label} />
      ))}
    </section>
  );
}

function ModelRow({
  configKey,
  label,
}: {
  configKey: "model:writing" | "model:chat" | "model:default";
  label: string;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["config", configKey],
    queryFn: () =>
      apiFetch<{ value: { provider: Provider; modelId: string } | null }>(
        `/config/${encodeURIComponent(configKey)}`,
      ),
  });

  const [provider, setProvider] = useState<Provider>("anthropic");
  const [modelId, setModelId] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.value) {
      setProvider(data.value.provider);
      setModelId(data.value.modelId);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/config/${encodeURIComponent(configKey)}`, {
        method: "PUT",
        body: JSON.stringify({ provider, modelId: modelId.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config", configKey] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  return (
    <div className="grid grid-cols-12 gap-3 rounded-md border border-border p-4">
      <div className="col-span-12 text-sm font-medium">{label}</div>
      <div className="col-span-4 space-y-1.5">
        <Label className="text-xs text-muted-foreground">Provider</Label>
        <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-6 space-y-1.5">
        <Label className="text-xs text-muted-foreground">Model ID</Label>
        <Input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="claude-opus-4-7"
        />
      </div>
      <div className="col-span-2 flex items-end">
        <Button
          onClick={() => save.mutate()}
          disabled={!modelId.trim() || save.isPending}
          className="w-full"
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : saved ? "Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function MemoriesSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["memory", "style_writing"],
    queryFn: () =>
      apiFetch<{ memory: { content: string } | null }>("/memories/style_writing"),
  });

  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setText(data?.memory?.content ?? "");
    setDirty(false);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/memories/style_writing", {
        method: "PUT",
        body: JSON.stringify({ content: text }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memory", "style_writing"] });
      setDirty(false);
    },
  });

  const analyze = useMutation({
    mutationFn: () =>
      apiFetch<{ content: string; sampleCount: number }>("/memories/analyze", {
        method: "POST",
        body: JSON.stringify({ sampleCount: 6 }),
      }),
    onSuccess: ({ content }) => {
      setText(content);
      queryClient.invalidateQueries({ queryKey: ["memory", "style_writing"] });
    },
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Memory — writing style</h2>
        <p className="text-sm text-muted-foreground">
          Prepended to the system prompt for writing assist and chat. Keep it as guidance, not an
          essay.
        </p>
      </div>
      <Textarea
        rows={10}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(e.target.value !== (data?.memory?.content ?? ""));
        }}
        placeholder="I write in short declarative sentences. Favor em-dashes over parentheses…"
      />
      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
        <Button
          variant="outline"
          onClick={() => analyze.mutate()}
          disabled={analyze.isPending}
        >
          {analyze.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Analyze my writing
        </Button>
        {analyze.isError && (
          <span className="text-sm text-destructive">
            Couldn't analyze (need at least one article).
          </span>
        )}
      </div>
    </section>
  );
}
