import type { WritingAction } from "@reel/shared";
import { slugify } from "@reel/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bot,
  Eraser,
  FileText,
  Keyboard,
  ListChecks,
  Loader2,
  MessageSquare,
  PanelRight,
  Pencil,
  Send,
  Settings,
  Share2,
  Sparkles,
  Tags,
  Trash2,
  Wand2,
} from "lucide-react";
import { forwardRef, useEffect, useRef, useState, type RefObject } from "react";

import { apiFetch, apiStream } from "../api";
import { CategoryChipInput } from "./category-chip-input";
import { Gallery, GalleryImage } from "./editor-extensions/gallery";
import { SlashCommand } from "./editor-extensions/slash-command";
import { PreviewPanel } from "./preview-panel";
import { WorkLinkInput } from "./work-link-input";
import { ResizeHandle } from "./resize-handle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

interface Initial {
  id?: number;
  title: string;
  slug: string;
  bodyJson: string;
  pinned: boolean;
  workIds: number[];
  categoryIds: number[];
  tagIds: number[];
}

const EMPTY: Initial = {
  title: "",
  slug: "",
  bodyJson: "{}",
  pinned: false,
  workIds: [],
  categoryIds: [],
  tagIds: [],
};

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const RIGHT_PANEL_MIN = 320;
const RIGHT_PANEL_MAX = 1400;
const RIGHT_PANEL_DEFAULT = 420;

export function ArticleEditor({ initial = EMPTY }: { initial?: Initial }) {
  const [title, setTitle] = useState(initial.title);
  const [pinned, setPinned] = useState(initial.pinned);
  const [workIds, setWorkIds] = useState<number[]>(initial.workIds);
  const [categoryIds, setCategoryIds] = useState<number[]>(initial.categoryIds);
  const [tagIds, setTagIds] = useState<number[]>(initial.tagIds);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<WritingAction | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  type RightPanel = "chat" | "preview" | null;
  const [rightPanel, setRightPanelState] = useState<RightPanel>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem("reel:rightPanel");
    if (stored === "chat" || stored === "preview" || stored === "none") {
      return stored === "none" ? null : stored;
    }
    return null;
  });
  function setRightPanel(next: RightPanel) {
    setRightPanelState(next);
    try {
      window.localStorage.setItem("reel:rightPanel", next ?? "none");
    } catch {
      // storage disabled
    }
  }
  function toggleChat() {
    setRightPanel(rightPanel === "chat" ? null : "chat");
  }
  function togglePreview() {
    setRightPanel(rightPanel === "preview" ? null : "preview");
  }
  const [mobilePanel, setMobilePanel] = useState<RightPanel>(null);
  function clearChat() {
    setChatMessages([]);
  }

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return RIGHT_PANEL_DEFAULT;
    const stored = Number(window.localStorage.getItem("reel:chatWidth") ?? "");
    return Number.isFinite(stored) && stored >= RIGHT_PANEL_MIN && stored <= RIGHT_PANEL_MAX
      ? stored
      : RIGHT_PANEL_DEFAULT;
  });
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;
  function handlePanelResize(w: number) {
    setPanelWidth(w);
    try {
      window.localStorage.setItem("reel:chatWidth", String(w));
    } catch {
      // storage disabled
    }
  }

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Gallery,
      GalleryImage,
      SlashCommand,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Heading";
          return "Type '/' for commands, or just start writing…";
        },
      }),
    ],
    content: safeParse(initial.bodyJson) ?? "",
    editorProps: {
      attributes: {
        class:
          "tiptap prose prose-neutral dark:prose-invert max-w-none focus:outline-none h-full",
      },
      handleKeyDown: (_view, event) => {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && (event.key === "k" || event.key === "K")) {
          event.preventDefault();
          promptLink();
          return true;
        }
        return false;
      },
    },
  });

  function promptLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("URL", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  async function handleImageFile(file: File) {
    if (!editor) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        window.alert(`Upload failed: ${await res.text()}`);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      const caption = window.prompt("Caption (optional)") ?? "";
      editor.commands.addImageToGallery({ src: url, caption });
    } finally {
      setUploading(false);
    }
  }

  // Slash-command image item fires this event; open the file picker.
  useEffect(() => {
    function onInsertImage() {
      imageInputRef.current?.click();
    }
    window.addEventListener("reel:editor-insert-image", onInsertImage);
    return () => window.removeEventListener("reel:editor-insert-image", onInsertImage);
  }, []);

  async function save() {
    if (!editor) return;
    setSaving(true);
    const finalSlug = slugify(title) || slugify(initial.slug) || `draft-${Date.now()}`;
    const payload = {
      slug: finalSlug,
      title: title.trim() || "Untitled",
      bodyJson: JSON.stringify(editor.getJSON()),
      bodyText: editor.getText(),
      pinned,
      workIds,
      categoryIds,
      tagIds,
    };
    try {
      if (initial.id) {
        await apiFetch(`/articles/${initial.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/articles", { method: "POST", body: JSON.stringify(payload) });
      }
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      navigate({ to: "/articles/$slug", params: { slug: finalSlug } });
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!initial.id) return;
    if (!confirm("Delete this article? This cannot be undone.")) return;
    await apiFetch(`/articles/${initial.id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["articles"] });
    navigate({ to: "/" });
  }

  async function runAiAction(action: WritingAction) {
    if (!editor) return;
    setAiBusy(action);
    const document = editor.getText();
    const { from, to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, "\n");
    try {
      const res = await apiStream("/ai/writing", {
        action,
        document,
        selection: selection || undefined,
        workIds,
      });
      if (!res.ok || !res.body) return;

      if (action === "continue") {
        await streamInto(res, (chunk) => editor.commands.insertContent(chunk));
        return;
      }
      if (action === "rewrite" && selection) {
        let buffer = "";
        await streamInto(res, (chunk) => {
          buffer += chunk;
        });
        editor.chain().focus().deleteRange({ from, to }).insertContent(buffer).run();
        return;
      }
      if (action === "summarize") {
        let buffer = "";
        await streamInto(res, (chunk) => {
          buffer += chunk;
        });
        editor.chain().focus().setTextSelection(editor.state.doc.content.size).run();
        editor.commands.insertContent([
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Summary" }] },
          { type: "paragraph", content: [{ type: "text", text: buffer.trim() }] },
        ]);
        return;
      }
      if (action === "suggest_title") {
        let buffer = "";
        await streamInto(res, (chunk) => {
          buffer += chunk;
        });
        const first =
          buffer
            .split("\n")
            .map((l) => l.replace(/^\s*\d+\.\s*/, "").trim())
            .find((l) => l.length > 0) ?? "";
        if (first) setTitle(first);
        return;
      }
      if (action === "suggest_tags") {
        let buffer = "";
        await streamInto(res, (chunk) => {
          buffer += chunk;
        });
        const suggestions = buffer
          .split(/[,\n]/)
          .map((s) => s.trim().replace(/^[-•]\s*/, ""))
          .filter(Boolean);
        await ensureAndAttachTags(suggestions, tagIds, setTagIds, queryClient);
      }
    } finally {
      setAiBusy(null);
    }
  }

  const hasSelection = Boolean(
    editor && editor.state.selection && editor.state.selection.from !== editor.state.selection.to,
  );

  function insertAtCursor(text: string) {
    if (!editor || !text.trim()) return;
    editor.chain().focus().insertContent(textToContent(text)).run();
  }

  function appendToDoc(text: string) {
    if (!editor || !text.trim()) return;
    editor
      .chain()
      .focus()
      .setTextSelection(editor.state.doc.content.size)
      .insertContent(textToContent(text))
      .run();
  }

  function replaceSelection(text: string) {
    if (!editor || !text.trim()) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    editor.chain().focus().deleteRange({ from, to }).insertContent(textToContent(text)).run();
  }

  async function sendChat() {
    if (!editor || !chatInput.trim() || chatBusy) return;
    const instruction = chatInput.trim();
    setChatInput("");
    setChatBusy(true);
    setChatMessages((m) => [
      ...m,
      { role: "user", text: instruction },
      { role: "assistant", text: "" },
    ]);
    try {
      const res = await apiStream("/ai/chat", {
        document: editor.getText(),
        workIds,
        instruction,
      });
      if (!res.ok || !res.body) {
        setChatMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", text: "(error)" };
          return next;
        });
        return;
      }
      await streamInto(res, (chunk) => {
        setChatMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { role: "assistant", text: last.text + chunk };
          }
          return next;
        });
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
      });
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div className="-m-6 flex h-[100vh] min-h-[100vh]">
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-2 px-6 py-3 lg:px-10">
          <ManageDialog
            hasId={Boolean(initial.id)}
            pinned={pinned}
            setPinned={setPinned}
            categoryIds={categoryIds}
            setCategoryIds={setCategoryIds}
            workIds={workIds}
            setWorkIds={setWorkIds}
            onDelete={del}
          />
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant={rightPanel === "preview" ? "secondary" : "ghost"}
              size="sm"
              className="hidden lg:inline-flex"
              onClick={togglePreview}
              title={rightPanel === "preview" ? "Hide preview" : "Show preview"}
              aria-label={rightPanel === "preview" ? "Hide preview" : "Show preview"}
            >
              <Share2 />
            </Button>
            <Button
              type="button"
              variant={rightPanel === "chat" ? "secondary" : "ghost"}
              size="sm"
              className="hidden lg:inline-flex"
              onClick={toggleChat}
              title={rightPanel === "chat" ? "Hide AI chat" : "Show AI chat"}
              aria-label={rightPanel === "chat" ? "Hide AI chat" : "Show AI chat"}
            >
              <PanelRight />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setMobilePanel("preview")}
            >
              <Share2 /> Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setMobilePanel("chat")}
            >
              <MessageSquare /> Chat
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-24 lg:px-10">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              className="w-full border-0 bg-transparent py-4 text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
            />
            <div className="flex min-h-0 flex-1 flex-col">
              <EditorContent editor={editor} className="flex-1" />
            </div>
          </div>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImageFile(f);
            e.target.value = "";
          }}
        />

        <AiFab busy={aiBusy} onAction={runAiAction} hasSelection={hasSelection} uploading={uploading} />

        <Sheet
          open={mobilePanel !== null}
          onOpenChange={(o) => {
            if (!o) setMobilePanel(null);
          }}
        >
          <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg">
            {mobilePanel === "chat" ? (
              <>
                <SheetHeader className="border-b border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SheetTitle className="flex items-center gap-2">
                        <Bot className="h-4 w-4" /> AI Chat
                      </SheetTitle>
                      <SheetDescription>
                        Grounded in this article draft and any linked works. Ephemeral.
                      </SheetDescription>
                    </div>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={clearChat}
                      disabled={chatMessages.length === 0 && !chatInput}
                      title="Clear conversation"
                      aria-label="Clear conversation"
                    >
                      <Eraser />
                    </Button>
                  </div>
                </SheetHeader>
                <ChatPanel
                  messages={chatMessages}
                  input={chatInput}
                  setInput={setChatInput}
                  send={sendChat}
                  busy={chatBusy}
                  scrollRef={chatScrollRef}
                  onInsert={insertAtCursor}
                  onAppend={appendToDoc}
                  onReplaceSelection={replaceSelection}
                  hasSelection={hasSelection}
                />
              </>
            ) : mobilePanel === "preview" ? (
              <>
                <SheetHeader className="sr-only">
                  <SheetTitle>Preview</SheetTitle>
                  <SheetDescription>Platform-native preview of your article.</SheetDescription>
                </SheetHeader>
                <PreviewPanel editor={editor} onClose={() => setMobilePanel(null)} />
              </>
            ) : null}
          </SheetContent>
        </Sheet>
      </main>

      <div className={rightPanel ? "hidden lg:flex lg:shrink-0" : "hidden"}>
        <ResizeHandle
          onResize={handlePanelResize}
          getCurrent={() => panelWidthRef.current}
          min={RIGHT_PANEL_MIN}
          max={RIGHT_PANEL_MAX}
        />
        <aside
          className="flex shrink-0 flex-col border-l border-border"
          style={{ width: `${panelWidth}px` }}
        >
          {rightPanel === "chat" ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Bot className="h-4 w-4" /> AI Chat
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Grounded in this article draft and any linked works. Ephemeral.
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={clearChat}
                  disabled={chatMessages.length === 0 && !chatInput}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  <Eraser />
                </Button>
              </div>
              <ChatPanel
                messages={chatMessages}
                input={chatInput}
                setInput={setChatInput}
                send={sendChat}
                busy={chatBusy}
                scrollRef={chatScrollRef}
                onInsert={insertAtCursor}
                onAppend={appendToDoc}
                onReplaceSelection={replaceSelection}
                hasSelection={hasSelection}
              />
            </>
          ) : rightPanel === "preview" ? (
            <PreviewPanel editor={editor} onClose={() => setRightPanel(null)} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function AiFab({
  busy,
  onAction,
  hasSelection,
  uploading,
}: {
  busy: WritingAction | null;
  onAction: (action: WritingAction) => void;
  hasSelection: boolean;
  uploading: boolean;
}) {
  const isBusy = busy !== null || uploading;
  const [fabOpen, setFabOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);

  function openAction(action: WritingAction) {
    setFabOpen(false);
    onAction(action);
  }

  function openIntro() {
    setFabOpen(false);
    setIntroOpen(true);
  }

  return (
    <>
      <div className="pointer-events-none absolute bottom-6 right-6 z-10">
        <Popover open={fabOpen} onOpenChange={setFabOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon-lg"
              className="pointer-events-auto h-12 w-12 rounded-full shadow-lg"
              aria-label="Assistant"
              title="Assistant"
            >
              {isBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={8}
            className="pointer-events-auto flex w-auto flex-col gap-2 border-none bg-transparent p-0 shadow-none"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <FabPill icon={<Sparkles />} label="AI" disabled={busy !== null} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="left" className="w-56">
                <DropdownMenuItem onClick={() => openAction("continue")} disabled={busy !== null}>
                  <Wand2 /> Continue writing
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openAction("rewrite")}
                  disabled={busy !== null || !hasSelection}
                >
                  <Pencil /> Rewrite selection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAction("summarize")} disabled={busy !== null}>
                  <FileText /> Summarize article
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openAction("suggest_title")} disabled={busy !== null}>
                  <ListChecks /> Suggest title
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAction("suggest_tags")} disabled={busy !== null}>
                  <Tags /> Suggest tags
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <FabPill icon={<Keyboard />} label="Intro" onClick={openIntro} />
          </PopoverContent>
        </Popover>
      </div>
      <IntroDialog open={introOpen} onOpenChange={setIntroOpen} />
    </>
  );
}

const FabPill = forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function FabPill({ icon, label, onClick, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 self-end rounded-full border border-border bg-popover px-4 py-2 text-sm font-medium text-popover-foreground shadow-md transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
      {...rest}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {label}
    </button>
  );
});

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "⌘B", label: "Bold" },
  { keys: "⌘I", label: "Italic" },
  { keys: "⌘U", label: "Underline" },
  { keys: "⌘⇧X", label: "Strikethrough" },
  { keys: "⌘E", label: "Inline code" },
  { keys: "⌘K", label: "Link" },
  { keys: "⌘Z", label: "Undo" },
  { keys: "⌘⇧Z", label: "Redo" },
  { keys: "⌘⇧7", label: "Numbered list" },
  { keys: "⌘⇧8", label: "Bullet list" },
  { keys: "⌘⇧B", label: "Quote" },
  { keys: "⌘⌥C", label: "Code block" },
];

const SLASH_COMMANDS: Array<{ cmd: string; label: string }> = [
  { cmd: "/h1", label: "Heading 1" },
  { cmd: "/h2", label: "Heading 2" },
  { cmd: "/h3", label: "Heading 3" },
  { cmd: "/bullet", label: "Bullet list" },
  { cmd: "/numbered", label: "Numbered list" },
  { cmd: "/quote", label: "Quote" },
  { cmd: "/code", label: "Code block" },
  { cmd: "/divider", label: "Divider" },
  { cmd: "/image", label: "Upload image" },
];

function IntroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editor reference</DialogTitle>
          <DialogDescription>
            Shortcuts for inline formatting, slash commands for blocks.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Shortcuts
            </h3>
            <ul className="space-y-1.5">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
                  <span>{s.label}</span>
                  <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Slash commands
            </h3>
            <p className="text-xs text-muted-foreground">
              Type <kbd className="rounded border border-border bg-secondary px-1 py-0.5 font-mono text-xs">/</kbd>{" "}
              on a new line, then filter.
            </p>
            <ul className="space-y-1.5">
              {SLASH_COMMANDS.map((s) => (
                <li key={s.cmd} className="flex items-center justify-between gap-4 text-sm">
                  <span>{s.label}</span>
                  <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs">
                    {s.cmd}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageDialog({
  hasId,
  pinned,
  setPinned,
  categoryIds,
  setCategoryIds,
  workIds,
  setWorkIds,
  onDelete,
}: {
  hasId: boolean;
  pinned: boolean;
  setPinned: (v: boolean) => void;
  categoryIds: number[];
  setCategoryIds: (ids: number[]) => void;
  workIds: number[];
  setWorkIds: (ids: number[]) => void;
  onDelete: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Article settings</DialogTitle>
          <DialogDescription>
            Metadata and linking — tags live in the editor header.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={pinned}
              onCheckedChange={(v) => setPinned(Boolean(v))}
            />
            Pinned
          </label>
          <div className="space-y-2">
            <Label>Categories</Label>
            <CategoryChipInput selected={categoryIds} onChange={setCategoryIds} />
          </div>
          <div className="space-y-2">
            <Label>Linked works</Label>
            <WorkLinkInput selected={workIds} onChange={setWorkIds} />
          </div>
        </div>
        {hasId && (
          <DialogFooter>
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 /> Delete article
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChatPanel({
  messages,
  input,
  setInput,
  send,
  busy,
  scrollRef,
  onInsert,
  onAppend,
  onReplaceSelection,
  hasSelection,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  send: () => void;
  busy: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onInsert: (text: string) => void;
  onAppend: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  hasSelection: boolean;
}) {
  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Ask anything about the draft or the linked works.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-8" : "mr-8"}>
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
            {m.role === "assistant" && m.text.trim() && (
              <AssistantActions
                text={m.text}
                onInsert={() => onInsert(m.text)}
                onAppend={() => onAppend(m.text)}
                onReplace={() => onReplaceSelection(m.text)}
                canReplace={hasSelection}
              />
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-border p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What would you like to ask?"
            className="min-h-10 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button type="submit" disabled={!input.trim() || busy} size="icon">
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </form>
      </div>
    </>
  );
}

function AssistantActions({
  text,
  onInsert,
  onAppend,
  onReplace,
  canReplace,
}: {
  text: string;
  onInsert: () => void;
  onAppend: () => void;
  onReplace: () => void;
  canReplace: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked
    }
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-xs">
      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onInsert}>
        Insert at cursor
      </Button>
      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onAppend}>
        Append
      </Button>
      {canReplace && (
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onReplace}>
          Replace selection
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** Convert plain text with blank-line paragraphs into Tiptap JSON. */
function textToContent(text: string) {
  const paragraphs = text.trim().split(/\n{2,}/);
  return paragraphs.map((p) => ({
    type: "paragraph",
    content: p.trim()
      ? p
          .split("\n")
          .flatMap((line, i, arr) => [
            { type: "text", text: line },
            ...(i < arr.length - 1 ? [{ type: "hardBreak" }] : []),
          ])
      : undefined,
  }));
}

async function streamInto(res: Response, onChunk: (chunk: string) => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value));
  }
}

async function ensureAndAttachTags(
  names: string[],
  currentIds: number[],
  setTagIds: (ids: number[]) => void,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const existing = await apiFetch<{ tags: Array<{ id: number; name: string }> }>("/tags");
  const byName = new Map(existing.tags.map((t) => [t.name.toLowerCase(), t.id]));
  const toAdd: number[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (!key) continue;
    const existingId = byName.get(key);
    if (existingId) {
      toAdd.push(existingId);
    } else {
      try {
        const { tag } = await apiFetch<{ tag: { id: number; name: string } }>("/tags", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        toAdd.push(tag.id);
        byName.set(tag.name.toLowerCase(), tag.id);
      } catch {
        // ignore
      }
    }
  }
  queryClient.invalidateQueries({ queryKey: ["tags"] });
  const next = Array.from(new Set([...currentIds, ...toAdd]));
  setTagIds(next);
}

function safeParse(s: string): unknown {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
