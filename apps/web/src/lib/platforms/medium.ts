import MarkdownIt from "markdown-it";

import type { PlatformDefinition } from "./types";

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

export const medium: PlatformDefinition = {
  id: "medium",
  label: "Medium",
  supportsAi: false, // Medium accepts our Markdown verbatim, so AI adaptation is a no-op.
  render(markdown) {
    const html = md.render(markdown);
    return {
      kind: "html",
      html,
      sandboxed: false,
      copy: {
        text: markdown, // Medium's paste-from-Markdown preserves structure best from raw MD.
        html,
      },
    };
  },
};
