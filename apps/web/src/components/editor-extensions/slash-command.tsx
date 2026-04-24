import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import {
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ComponentType,
} from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";

export interface SlashItem {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  keywords?: string[];
  command: (args: { editor: Editor; range: Range }) => void;
}

const ITEMS: SlashItem[] = [
  {
    title: "Heading 1",
    description: "Big section heading",
    icon: Heading1,
    keywords: ["h1", "title"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    keywords: ["h2"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    keywords: ["h3"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Bullet list",
    description: "Unordered list",
    icon: List,
    keywords: ["ul", "bullet"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "Ordered list",
    icon: ListOrdered,
    keywords: ["ol", "numbered", "ordered"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Quote",
    description: "Callout / blockquote",
    icon: Quote,
    keywords: ["blockquote"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Code block",
    description: "Fenced code block",
    icon: SquareCode,
    keywords: ["code", "pre"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: Minus,
    keywords: ["hr", "rule", "separator"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Image",
    description: "Upload an image",
    icon: ImageIcon,
    keywords: ["img", "photo", "picture"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent("reel:editor-insert-image"));
    },
  },
];

function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return ITEMS;
  return ITEMS.filter((item) => {
    const hay = [item.title, ...(item.keywords ?? [])].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

interface MenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashMenu = forwardRef<MenuRef, SuggestionProps<SlashItem>>((props, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [props.items]);

  const pick = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelected((i) => (i + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % props.items.length);
        return true;
      }
      if (event.key === "Enter") {
        pick(selected);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
        No matches
      </div>
    );
  }

  return (
    <div className="w-64 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md">
      {props.items.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={item.title}
            type="button"
            onMouseEnter={() => setSelected(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(i);
            }}
            className={`flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm ${
              i === selected ? "bg-accent text-accent-foreground" : ""
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <div className="truncate font-medium">{item.title}</div>
              <div className="truncate text-xs text-muted-foreground">{item.description}</div>
            </span>
          </button>
        );
      })}
    </div>
  );
});
SlashMenu.displayName = "SlashMenu";

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: SlashItem;
        }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }) => filterItems(query),
        render: () => {
          let component: ReactRenderer<MenuRef> | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor,
              });
              if (!props.clientRect) return;
              popup = tippy(document.body, {
                getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              if (!popup || !props.clientRect) return;
              popup.setProps({
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
              });
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                popup?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              popup?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
