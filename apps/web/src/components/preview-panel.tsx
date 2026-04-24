import type { Editor } from "@tiptap/react";
import { Copy, Loader2, Sparkles, RotateCcw, Check, X as XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Platform } from "@reel/shared";

import { apiStream } from "../api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLATFORMS, PLATFORM_LIST, tiptapToMarkdown } from "@/lib/platforms";

type AiCache = Partial<Record<Platform, string>>;
type ThemeCache = Partial<Record<Platform, string>>;

export function PreviewPanel({
  editor,
  onClose,
}: {
  editor: Editor | null;
  onClose: () => void;
}) {
  const [markdown, setMarkdown] = useState<string>(() =>
    editor ? tiptapToMarkdown(editor.getJSON()) : "",
  );
  const [platformId, setPlatformId] = useState<Platform>("medium");
  const [themeByPlatform, setThemeByPlatform] = useState<ThemeCache>({});
  const [aiByPlatform, setAiByPlatform] = useState<AiCache>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const update = () => setMarkdown(tiptapToMarkdown(editor.getJSON()));
    editor.on("update", update);
    update();
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  const platform = PLATFORMS[platformId];
  const activeTheme = themeByPlatform[platformId] ?? platform.defaultTheme;
  const aiOverride = aiByPlatform[platformId];
  const source = aiOverride ?? markdown;

  const preview = useMemo(
    () => platform.render(source, { theme: activeTheme }),
    [platform, source, activeTheme],
  );

  async function runAi() {
    if (!platform.supportsAi || !markdown.trim()) return;
    setAiBusy(true);
    setAiByPlatform((m) => ({ ...m, [platformId]: "" }));
    try {
      const res = await apiStream("/ai/adapt", {
        platform: platformId,
        markdown,
        theme: activeTheme,
      });
      if (!res.ok || !res.body) {
        setAiByPlatform((m) => ({ ...m, [platformId]: undefined }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        setAiByPlatform((m) => ({ ...m, [platformId]: buffer }));
      }
    } finally {
      setAiBusy(false);
    }
  }

  function discardAi() {
    setAiByPlatform((m) => ({ ...m, [platformId]: undefined }));
  }

  async function copy() {
    const { text, html } = preview.copy;
    try {
      if (html && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard blocked
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Preview</h2>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            title="Close preview"
            aria-label="Close preview"
          >
            <XIcon />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={platformId}
            onValueChange={(v) => setPlatformId(v as Platform)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_LIST.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {platform.themes && platform.themes.length > 1 && (
            <Select
              value={activeTheme ?? platform.defaultTheme}
              onValueChange={(v) =>
                setThemeByPlatform((m) => ({ ...m, [platformId]: v }))
              }
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platform.themes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="ml-auto flex items-center gap-1">
            {platform.supportsAi && (
              <Button
                size="xs"
                variant={aiOverride ? "secondary" : "outline"}
                onClick={runAi}
                disabled={aiBusy || !markdown.trim()}
                title={aiOverride ? "Regenerate" : `Adapt for ${platform.label}`}
              >
                {aiBusy ? (
                  <Loader2 className="animate-spin" />
                ) : aiOverride ? (
                  <RotateCcw />
                ) : (
                  <Sparkles />
                )}
                {aiOverride ? "Regenerate" : "AI adapt"}
              </Button>
            )}
            {aiOverride && !aiBusy && (
              <Button size="xs" variant="ghost" onClick={discardAi} title="Use original">
                Reset
              </Button>
            )}
            <Button size="xs" variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        {aiOverride && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing AI-adapted version. "Reset" restores the source.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-muted/30 p-4">
        {!source.trim() ? (
          <div className="text-sm text-muted-foreground">
            Write something in the editor to see the preview.
          </div>
        ) : preview.kind === "html" ? (
          preview.sandboxed ? (
            <SandboxedHtml html={preview.html} />
          ) : (
            <div
              className="prose prose-neutral dark:prose-invert max-w-none rounded-md border border-border bg-background p-5"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          )
        ) : preview.kind === "thread" ? (
          <ThreadView tweets={preview.tweets} />
        ) : (
          <PostView body={preview.body} hashtags={preview.hashtags} />
        )}
      </div>
    </div>
  );
}

function SandboxedHtml({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:16px;background:#fff;}</style></head><body>${html}</body></html>`,
    );
    doc.close();
    // Resize to content
    const resize = () => {
      const h = doc.body?.scrollHeight ?? 600;
      setHeight(Math.max(200, h + 8));
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (doc.body) ro.observe(doc.body);
    return () => ro.disconnect();
  }, [html]);
  return (
    <iframe
      ref={ref}
      title="WeChat preview"
      className="w-full rounded-md border border-border bg-background"
      style={{ height: `${height}px` }}
    />
  );
}

function ThreadView({ tweets }: { tweets: string[] }) {
  if (tweets.length === 0) {
    return <div className="text-sm text-muted-foreground">Nothing to preview.</div>;
  }
  return (
    <div className="space-y-3">
      {tweets.map((t, i) => {
        const count = [...t].length;
        const over = count > 280;
        return (
          <div
            key={i}
            className="rounded-md border border-border bg-background p-4 text-sm"
          >
            <div className="whitespace-pre-wrap">{t}</div>
            <div
              className={`mt-2 text-right text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}
            >
              {count} / 280
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PostView({ body, hashtags }: { body: string; hashtags: string[] }) {
  const chars = [...body].length;
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-md border border-border bg-background p-4">
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{body}</div>
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.map((tag, i) => (
            <span
              key={i}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="text-right text-xs text-muted-foreground">{chars} chars</div>
    </div>
  );
}
