// WeChat themes: inline CSS only, since 公众号 strips <style>/<class>.
// Each entry is the exact `style="…"` value rendered into the matching tag.

export type WechatThemeId = "default" | "minimal" | "geek";

export type WechatTheme = {
  id: WechatThemeId;
  label: string;
  container: string;
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  p: string;
  blockquote: string;
  ul: string;
  ol: string;
  li: string;
  pre: string;
  code: string; // inline code
  hr: string;
  a: string;
  strong: string;
  em: string;
  img: string;
};

const COMMON_FONT =
  "font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;";

const DEFAULT_THEME: WechatTheme = {
  id: "default",
  label: "Default",
  container:
    `${COMMON_FONT} color: #333; font-size: 15px; line-height: 1.75; letter-spacing: 0.04em; padding: 4px 0;`,
  h1:
    `${COMMON_FONT} font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #3b82f6;`,
  h2:
    `${COMMON_FONT} font-size: 19px; font-weight: 700; color: #1a1a1a; margin: 28px 0 14px; padding-left: 10px; border-left: 4px solid #3b82f6;`,
  h3:
    `${COMMON_FONT} font-size: 17px; font-weight: 600; color: #1a1a1a; margin: 22px 0 12px;`,
  h4:
    `${COMMON_FONT} font-size: 15px; font-weight: 600; color: #1a1a1a; margin: 18px 0 10px;`,
  p: `margin: 14px 0; text-align: justify;`,
  blockquote:
    `margin: 16px 0; padding: 12px 16px; background: #f5f7fa; border-left: 4px solid #3b82f6; color: #555; font-size: 14px;`,
  ul: `margin: 14px 0; padding-left: 24px;`,
  ol: `margin: 14px 0; padding-left: 24px;`,
  li: `margin: 6px 0;`,
  pre: `margin: 16px 0; padding: 14px 16px; background: #0f172a; color: #e2e8f0; border-radius: 6px; font-size: 13px; line-height: 1.6; overflow-x: auto; font-family: 'SF Mono', Consolas, Menlo, monospace; white-space: pre;`,
  code: `padding: 2px 6px; background: #eef2ff; color: #3b3b98; border-radius: 3px; font-size: 90%; font-family: 'SF Mono', Consolas, Menlo, monospace;`,
  hr: `border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;`,
  a: `color: #3b82f6; text-decoration: none; border-bottom: 1px solid #3b82f6;`,
  strong: `font-weight: 700; color: #1a1a1a;`,
  em: `font-style: italic;`,
  img: `display: block; max-width: 100%; margin: 18px auto; border-radius: 4px;`,
};

const MINIMAL_THEME: WechatTheme = {
  id: "minimal",
  label: "Minimal",
  container: `${COMMON_FONT} color: #111; font-size: 15px; line-height: 1.8; padding: 4px 0;`,
  h1:
    `${COMMON_FONT} font-size: 24px; font-weight: 700; color: #000; margin: 32px 0 18px;`,
  h2:
    `${COMMON_FONT} font-size: 20px; font-weight: 700; color: #000; margin: 28px 0 14px;`,
  h3:
    `${COMMON_FONT} font-size: 17px; font-weight: 600; color: #000; margin: 22px 0 12px;`,
  h4:
    `${COMMON_FONT} font-size: 15px; font-weight: 600; color: #000; margin: 18px 0 10px;`,
  p: `margin: 14px 0;`,
  blockquote:
    `margin: 16px 0; padding: 0 0 0 16px; border-left: 2px solid #000; color: #555;`,
  ul: `margin: 14px 0; padding-left: 22px;`,
  ol: `margin: 14px 0; padding-left: 22px;`,
  li: `margin: 6px 0;`,
  pre: `margin: 16px 0; padding: 12px 14px; background: #f6f6f6; color: #111; border-radius: 4px; font-size: 13px; line-height: 1.6; overflow-x: auto; font-family: 'SF Mono', Consolas, Menlo, monospace; white-space: pre;`,
  code: `padding: 2px 5px; background: #f0f0f0; color: #111; border-radius: 2px; font-size: 90%; font-family: 'SF Mono', Consolas, Menlo, monospace;`,
  hr: `border: none; border-top: 1px solid #ccc; margin: 28px 0;`,
  a: `color: #000; text-decoration: underline;`,
  strong: `font-weight: 700;`,
  em: `font-style: italic;`,
  img: `display: block; max-width: 100%; margin: 18px auto;`,
};

const GEEK_THEME: WechatTheme = {
  id: "geek",
  label: "极客",
  container: `${COMMON_FONT} color: #abb2bf; background: #1e222a; font-size: 14.5px; line-height: 1.75; padding: 16px;`,
  h1:
    `${COMMON_FONT} font-size: 22px; font-weight: 700; color: #61afef; margin: 32px 0 16px; border-bottom: 1px dashed #3b4048; padding-bottom: 8px;`,
  h2:
    `${COMMON_FONT} font-size: 19px; font-weight: 700; color: #98c379; margin: 28px 0 14px;`,
  h3:
    `${COMMON_FONT} font-size: 17px; font-weight: 600; color: #e5c07b; margin: 22px 0 12px;`,
  h4:
    `${COMMON_FONT} font-size: 15px; font-weight: 600; color: #c678dd; margin: 18px 0 10px;`,
  p: `margin: 14px 0;`,
  blockquote:
    `margin: 16px 0; padding: 10px 14px; background: #282c34; border-left: 3px solid #98c379; color: #8892a0;`,
  ul: `margin: 14px 0; padding-left: 22px;`,
  ol: `margin: 14px 0; padding-left: 22px;`,
  li: `margin: 6px 0;`,
  pre: `margin: 16px 0; padding: 14px 16px; background: #282c34; color: #abb2bf; border-radius: 4px; font-size: 13px; line-height: 1.6; overflow-x: auto; font-family: 'SF Mono', Consolas, Menlo, monospace; white-space: pre;`,
  code: `padding: 2px 6px; background: #282c34; color: #e06c75; border-radius: 3px; font-size: 90%; font-family: 'SF Mono', Consolas, Menlo, monospace;`,
  hr: `border: none; border-top: 1px dashed #3b4048; margin: 28px 0;`,
  a: `color: #61afef; text-decoration: none; border-bottom: 1px solid #61afef;`,
  strong: `font-weight: 700; color: #e5c07b;`,
  em: `font-style: italic; color: #c678dd;`,
  img: `display: block; max-width: 100%; margin: 18px auto; border-radius: 4px;`,
};

export const WECHAT_THEMES: Record<WechatThemeId, WechatTheme> = {
  default: DEFAULT_THEME,
  minimal: MINIMAL_THEME,
  geek: GEEK_THEME,
};

export const WECHAT_THEME_LIST = [DEFAULT_THEME, MINIMAL_THEME, GEEK_THEME].map(
  (t) => ({ id: t.id, label: t.label }),
);
