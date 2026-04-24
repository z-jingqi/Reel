import type { PlatformDefinition } from "./types";

export const xiaohongshu: PlatformDefinition = {
  id: "xiaohongshu",
  label: "小红书",
  supportsAi: true,
  render(markdown) {
    const { body, hashtags } = extractPost(markdown);
    const copyText = hashtags.length ? `${body}\n\n${hashtags.join(" ")}` : body;
    return {
      kind: "post",
      body,
      hashtags,
      copy: { text: copyText },
    };
  },
};

function extractPost(markdown: string): { body: string; hashtags: string[] } {
  // Strip to plain text while keeping paragraph breaks. Pull trailing hashtag
  // lines into their own list so the preview can render them as pills.
  const plain = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = plain.split("\n");
  const hashtags: string[] = [];
  // Walk from the end — any line that is entirely hashtag-ish gets hoisted out.
  while (lines.length) {
    const last = (lines[lines.length - 1] ?? "").trim();
    if (!last) {
      lines.pop();
      continue;
    }
    const tags = last.match(/#[\p{L}\p{N}_]+/gu);
    const strippedOfTags = last.replace(/#[\p{L}\p{N}_]+/gu, "").trim();
    if (tags && tags.length && strippedOfTags.length === 0) {
      hashtags.unshift(...tags);
      lines.pop();
    } else {
      break;
    }
  }
  return { body: lines.join("\n").trim(), hashtags };
}
