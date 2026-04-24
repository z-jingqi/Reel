import type { PlatformDefinition } from "./types";

const MAX_PER_TWEET = 270; // Leave 10 chars of headroom below the 280 limit.

export const x: PlatformDefinition = {
  id: "x",
  label: "X (Twitter)",
  supportsAi: true,
  render(markdown) {
    const plain = toPlainText(markdown);
    const tweets = splitIntoTweets(plain);
    // If the input already looks like a numbered thread (e.g. the AI-adapted
    // output), keep it as-is — each non-empty line is one tweet.
    const lines = plain
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const looksPreNumbered =
      lines.length >= 2 &&
      lines.every((l) => /^\d+\s*\/\s*/.test(l)) &&
      lines.every((l) => l.length <= 280);
    const final = looksPreNumbered ? lines : tweets;
    return {
      kind: "thread",
      tweets: final,
      copy: { text: final.join("\n\n") },
    };
  },
};

function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "") // code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // images
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // links
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^>\s?/gm, "") // quotes
    .replace(/^[-*+]\s+/gm, "• ") // bullets
    .replace(/^\d+\.\s+/gm, "") // ordered markers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/__([^_]+)__/g, "$1") // underline
    .replace(/~~([^~]+)~~/g, "$1") // strike
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoTweets(plain: string): string[] {
  if (!plain) return [];
  const paragraphs = plain.split(/\n{2,}/).filter(Boolean);
  const raw: string[] = [];
  for (const p of paragraphs) {
    raw.push(...chunkParagraph(p, MAX_PER_TWEET));
  }
  // Number tweets 1/N, 2/N … if we have more than one.
  if (raw.length <= 1) return raw;
  return raw.map((t, i) => `${i + 1}/ ${t}`);
}

function chunkParagraph(text: string, limit: number): string[] {
  const out: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    // Prefer breaking on sentence end, then on space.
    let cut = remaining.lastIndexOf(". ", limit);
    if (cut < limit * 0.6) cut = remaining.lastIndexOf("? ", limit);
    if (cut < limit * 0.6) cut = remaining.lastIndexOf("! ", limit);
    if (cut < limit * 0.6) cut = remaining.lastIndexOf(" ", limit);
    if (cut < 40) cut = limit; // fallback: hard cut
    out.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) out.push(remaining);
  return out;
}
