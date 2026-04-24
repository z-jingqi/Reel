// Convert a TipTap JSON document into Markdown for the node types this app
// actually uses: headings, paragraphs, lists, quotes, code, horizontal rules,
// hard breaks, and our custom Gallery/GalleryImage nodes. Marks: bold, italic,
// strike, code, link, underline (underline renders as __text__ since Markdown
// has no native underline).
//
// This is intentionally narrow — no pluggable rules, no catch-all. If a new
// node type is added to the editor, extend this file explicitly.

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export function tiptapToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const d = doc as Node;
  if (d.type !== "doc" || !Array.isArray(d.content)) return "";
  return d.content.map(renderBlock).join("\n\n").trim() + "\n";
}

function renderBlock(node: Node): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return "#".repeat(level) + " " + renderInline(node.content ?? []);
    }
    case "paragraph":
      return renderInline(node.content ?? []);
    case "bulletList":
      return (node.content ?? [])
        .map((li) => "- " + renderListItem(li))
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ` + renderListItem(li))
        .join("\n");
    case "blockquote":
      return (node.content ?? [])
        .map(renderBlock)
        .join("\n\n")
        .split("\n")
        .map((l) => "> " + l)
        .join("\n");
    case "codeBlock": {
      const lang = (node.attrs?.language as string) || "";
      const text = (node.content ?? [])
        .map((n) => n.text ?? "")
        .join("");
      return "```" + lang + "\n" + text + "\n```";
    }
    case "horizontalRule":
      return "---";
    case "gallery":
      return (node.content ?? []).map(renderBlock).join("\n\n");
    case "galleryImage": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      const caption = (node.attrs?.caption as string) ?? "";
      if (!src) return "";
      const img = `![${alt}](${src})`;
      return caption ? `${img}\n\n*${caption}*` : img;
    }
    default:
      // Fallback: render inline content if any, else drop.
      return renderInline(node.content ?? []);
  }
}

function renderListItem(node: Node): string {
  const blocks = (node.content ?? []).map(renderBlock);
  // First block on the same line; nested blocks indented two spaces.
  if (blocks.length === 0) return "";
  const first = blocks[0] ?? "";
  const rest = blocks.slice(1);
  if (rest.length === 0) return first;
  const indented = rest.map((b) => b.split("\n").map((l) => "  " + l).join("\n"));
  return [first, ...indented].join("\n");
}

function renderInline(nodes: Node[]): string {
  return nodes.map(renderInlineNode).join("");
}

function renderInlineNode(node: Node): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type !== "text") {
    // Unknown inline node: try its content, else drop.
    return renderInline(node.content ?? []);
  }
  let text = escapeText(node.text ?? "");
  const marks = node.marks ?? [];
  // Apply in innermost-first order: code, strike, em, strong, underline, link
  for (const m of marks) {
    switch (m.type) {
      case "code":
        text = "`" + text + "`";
        break;
      case "strike":
        text = "~~" + text + "~~";
        break;
      case "italic":
        text = "*" + text + "*";
        break;
      case "bold":
        text = "**" + text + "**";
        break;
      case "underline":
        text = "__" + text + "__";
        break;
      case "link": {
        const href = (m.attrs?.href as string) ?? "";
        text = `[${text}](${href})`;
        break;
      }
    }
  }
  return text;
}

function escapeText(s: string): string {
  // Escape the minimum set of Markdown metacharacters that would change meaning
  // inside a paragraph. We keep this narrow — over-escaping produces ugly output.
  return s.replace(/([\\`*_[\]])/g, "\\$1");
}
