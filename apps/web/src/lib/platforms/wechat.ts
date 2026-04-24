import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";

import type { PlatformDefinition } from "./types";
import { WECHAT_THEMES, WECHAT_THEME_LIST, type WechatTheme } from "./wechat-themes";

function buildRenderer(theme: WechatTheme): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

  // Each override: set the matching inline style, then let the default token
  // renderer emit the tag. WeChat strips <style> and classes, so every visual
  // decision rides on the element's `style` attribute.
  const wrap =
    (style: string): RenderRule =>
    (tokens, idx, options, _env, self) => {
      const tok = tokens[idx];
      if (tok) tok.attrJoin("style", style);
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    const tok = tokens[idx];
    if (tok) {
      const tag = tok.tag as keyof WechatTheme;
      const style = (theme[tag] as string | undefined) ?? "";
      if (style) tok.attrJoin("style", style);
    }
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.paragraph_open = wrap(theme.p);
  md.renderer.rules.blockquote_open = wrap(theme.blockquote);
  md.renderer.rules.bullet_list_open = wrap(theme.ul);
  md.renderer.rules.ordered_list_open = wrap(theme.ol);
  md.renderer.rules.list_item_open = wrap(theme.li);
  md.renderer.rules.hr = (tokens, idx) => {
    const tok = tokens[idx];
    return `<hr style="${theme.hr}"${renderAttrs(tok?.attrs ?? null)} />`;
  };
  md.renderer.rules.code_inline = (tokens, idx) => {
    const content = escapeHtml(tokens[idx]?.content ?? "");
    return `<code style="${theme.code}">${content}</code>`;
  };
  md.renderer.rules.fence = (tokens, idx) => {
    const content = escapeHtml(tokens[idx]?.content ?? "");
    return `<pre style="${theme.pre}"><code>${content}</code></pre>`;
  };
  md.renderer.rules.code_block = md.renderer.rules.fence;
  md.renderer.rules.link_open = wrap(theme.a);
  md.renderer.rules.strong_open = wrap(theme.strong);
  md.renderer.rules.em_open = wrap(theme.em);
  md.renderer.rules.image = (tokens, idx) => {
    const tok = tokens[idx] as Token | undefined;
    const src = tok?.attrGet("src") ?? "";
    const alt = tok?.content ?? "";
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="${theme.img}" />`;
  };

  return md;
}

function renderAttrs(attrs: Array<[string, string]> | null): string {
  if (!attrs) return "";
  return attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join("");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export const wechat: PlatformDefinition = {
  id: "wechat",
  label: "微信公众号",
  supportsAi: true,
  themes: WECHAT_THEME_LIST,
  defaultTheme: "default",
  render(markdown, { theme }) {
    const themeId = (theme ?? "default") as keyof typeof WECHAT_THEMES;
    const t = WECHAT_THEMES[themeId] ?? WECHAT_THEMES.default;
    const md = buildRenderer(t);
    const body = md.render(markdown);
    // Outer wrapper carries container-level styling. No <style> block: every
    // visual decision lives on inline `style` attrs, which is what WeChat
    // preserves when the user pastes into the 公众号 editor.
    const html = `<section style="${t.container}">${body}</section>`;
    return {
      kind: "html",
      html,
      sandboxed: true,
      copy: { text: stripToPlain(markdown), html },
    };
  },
};

function stripToPlain(markdown: string): string {
  return markdown
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .trim();
}
