import type { Platform } from "@reel/shared";

export type CopyPayload = {
  text: string;
  // When present, the platform prefers a rich paste (ClipboardItem with text/html).
  html?: string;
};

export type PreviewResult =
  | {
      kind: "html";
      html: string;
      // When true, render inside an iframe so inline styles don't leak into the app.
      sandboxed?: boolean;
      copy: CopyPayload;
    }
  | {
      kind: "thread";
      tweets: string[];
      copy: CopyPayload;
    }
  | {
      kind: "post";
      body: string;
      hashtags: string[];
      copy: CopyPayload;
    };

export interface PlatformTheme {
  id: string;
  label: string;
}

export interface PlatformDefinition {
  id: Platform;
  label: string;
  supportsAi: boolean;
  themes?: PlatformTheme[];
  defaultTheme?: string;
  render(markdown: string, opts: { theme?: string }): PreviewResult;
}
