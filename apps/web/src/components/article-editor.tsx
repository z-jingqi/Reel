import type { WritingAction } from "@reel/shared";
import { slugify } from "@reel/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Bot,
  Code,
  Eraser,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  MessageSquare,
  Minus,
  PanelRight,
  Pencil,
  Quote,
  Redo2,
  Send,
  Settings,
  Sparkles,
  SquareCode,
  Strikethrough,
  Tags,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  Wand2,
} from "lucide-react";
import { useRef, useState, type RefObject } from "react";

import { apiFetch, apiStream } from "../api";
import { CategoryChipInput } from "./category-chip-input";
import { Gallery, GalleryImage } from "./editor-extensions/gallery";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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

export function ArticleEditor({ initial = EMPTY }: { initial?: Initial }) {
  const [title, setTitle] = useState(initial.title);
  const [pinned, setPinned] = useState(initial.pinned);
  const [workIds, setWorkIds] = useState<number[]>(initial.workIds);
  const [categoryIds, setCategoryIds] = useState<number[]>(initial.categoryIds);
  const [tagIds, setTagIds] = useState<number[]>(initial.tagIds);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<WritingAction | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [showChat, setShowChat] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("reel:showChat") !== "0";
  });
  function toggleChat() {
    setShowChat((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("reel:showChat", next ? "1" : "0");
      } catch {
        // storage disabled
      }
      return next;
    });
  }
  function clearChat() {
    setChatMessages([]);
  }

  const [chatWidth, setChatWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 384;
    const stored = Number(window.localStorage.getItem("reel:chatWidth") ?? "");
    return Number.isFinite(stored) && stored >= 280 && stored <= 800 ? stored : 384;
  });
  const chatWidthRef = useRef(chatWidth);
  chatWidthRef.current = chatWidth;
  function handleChatResize(w: number) {
    setChatWidth(w);
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
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: safeParse(initial.bodyJson) ?? "",
    editorProps: {
      attributes: {
        class:
          "tiptap prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[calc(100vh-16rem)]",
      },
    },
  });

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
    <div className="-m-6 flex h-[calc(100vh)] min-h-[calc(100vh)]">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
            <header className="mb-6 flex items-start gap-3">
              <div className="flex-1">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="!h-auto border-0 bg-transparent px-0 text-3xl font-semibold shadow-none focus-visible:ring-0"
                />
              </div>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden lg:inline-flex"
                onClick={toggleChat}
                title={showChat ? "Hide AI chat" : "Show AI chat"}
                aria-label={showChat ? "Hide AI chat" : "Show AI chat"}
              >
                <PanelRight />
              </Button>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <MessageSquare /> Chat
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg">
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
                </SheetContent>
              </Sheet>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </header>

            <EditorToolbar editor={editor} aiBusy={aiBusy} onAi={runAiAction} />
            <div className="mt-3 rounded-md border border-border bg-card px-5 py-4 transition-colors focus-within:border-ring">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </main>
      <div className={showChat ? "hidden lg:flex lg:shrink-0" : "hidden"}>
        <ResizeHandle
          onResize={handleChatResize}
          getCurrent={() => chatWidthRef.current}
          min={280}
          max={800}
        />
        <aside
          className="flex shrink-0 flex-col"
          style={{ width: `${chatWidth}px` }}
        >
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
        </aside>
      </div>
    </div>
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
        <Button variant="outline" size="icon">
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

function EditorToolbar({
  editor,
  aiBusy,
  onAi,
}: {
  editor: Editor | null;
  aiBusy: WritingAction | null;
  onAi: (action: WritingAction) => void;
}) {
  if (!editor) return null;
  const hasSelection =
    editor.state.selection && editor.state.selection.from !== editor.state.selection.to;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onAddImage = () => {
    fileInputRef.current?.click();
  };

  const handleFile = async (file: File) => {
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
        const text = await res.text();
        window.alert(`Upload failed: ${text}`);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      const caption = window.prompt("Caption (optional)") ?? "";
      editor.commands.addImageToGallery({ src: url, caption });
    } finally {
      setUploading(false);
    }
  };

  const onAddLink = () => {
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("URL", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-card p-1">
      <ToolbarGroup>
        <ToolbarButton
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo2 />
        </ToolbarButton>
      </ToolbarGroup>

      <Divider />

      <ToolbarGroup>
        <ToolbarButton
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 />
        </ToolbarButton>
      </ToolbarGroup>

      <Divider />

      <ToolbarGroup>
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code />
        </ToolbarButton>
      </ToolbarGroup>

      <Divider />

      <ToolbarGroup>
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Ordered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <SquareCode />
        </ToolbarButton>
        <ToolbarButton
          label="Horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus />
        </ToolbarButton>
      </ToolbarGroup>

      <Divider />

      <ToolbarGroup>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <ToolbarButton
          label={
            uploading
              ? "Uploading…"
              : editor.isActive("gallery")
                ? "Add image to row"
                : "Insert image"
          }
          onClick={onAddImage}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <ImageIcon />}
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
          onClick={onAddLink}
        >
          <Link2 />
        </ToolbarButton>
      </ToolbarGroup>

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="outline">
              <Sparkles />
              AI
              {aiBusy && <Loader2 className="animate-spin" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAi("continue")} disabled={aiBusy !== null}>
              <Wand2 /> Continue writing
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAi("rewrite")}
              disabled={aiBusy !== null || !hasSelection}
            >
              <Pencil /> Rewrite selection
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAi("summarize")} disabled={aiBusy !== null}>
              <FileText /> Summarize article
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAi("suggest_title")} disabled={aiBusy !== null}>
              <ListChecks /> Suggest title
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAi("suggest_tags")} disabled={aiBusy !== null}>
              <Tags /> Suggest tags
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-border" />;
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={active ? "secondary" : "ghost"}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
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
