import type { Platform } from "@reel/shared";

import { medium } from "./medium";
import { wechat } from "./wechat";
import { x } from "./x";
import { xiaohongshu } from "./xiaohongshu";
import type { PlatformDefinition } from "./types";

// Registry. Adding a new platform: add the id to platformSchema in @reel/shared,
// write the transform here, add the server-side prompt in routes/ai.ts.
export const PLATFORMS: Record<Platform, PlatformDefinition> = {
  medium,
  wechat,
  x,
  xiaohongshu,
};

export const PLATFORM_LIST: PlatformDefinition[] = [medium, wechat, x, xiaohongshu];

export { tiptapToMarkdown } from "./tiptap-to-md";
export type {
  CopyPayload,
  PlatformDefinition,
  PlatformTheme,
  PreviewResult,
} from "./types";
