import { mergeAttributes, Node, type CommandProps, type ChainedCommands } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    gallery: {
      /** Insert a new gallery below current block with the given images. */
      insertGallery: (images: Array<{ src: string; alt?: string; caption?: string }>) => ReturnType;
      /** Append an image to the gallery containing the current selection, or create one. */
      addImageToGallery: (image: { src: string; alt?: string; caption?: string }) => ReturnType;
    };
  }
}

/**
 * A block-level node that holds one or more images in a centered flex row.
 * Each `galleryImage` child is atom-ish with `src`, `alt`, and `caption` attrs.
 * Captions are edited via the UI (not inline ProseMirror edits), which keeps
 * the node model simple for MVP.
 */
export const Gallery = Node.create({
  name: "gallery",
  group: "block",
  content: "galleryImage+",
  draggable: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'figure[data-gallery]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-gallery": "", class: "gallery" }), 0];
  },

  addCommands() {
    const typeName = this.name;
    return {
      insertGallery:
        (images: Array<{ src: string; alt?: string; caption?: string }>) =>
        ({ chain }: { chain: () => ChainedCommands }) => {
          if (!images.length) return false;
          return chain()
            .focus()
            .insertContent({
              type: typeName,
              content: images.map((img) => ({
                type: "galleryImage",
                attrs: { src: img.src, alt: img.alt ?? "", caption: img.caption ?? "" },
              })),
            })
            .run();
        },
      addImageToGallery:
        (image: { src: string; alt?: string; caption?: string }) =>
        ({ state, chain }: CommandProps) => {
          const { $from } = state.selection;
          let galleryPos: number | null = null;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === "gallery") {
              galleryPos = $from.before(depth) + node.nodeSize - 1;
              break;
            }
          }
          if (galleryPos != null) {
            return chain()
              .focus()
              .insertContentAt(galleryPos, {
                type: "galleryImage",
                attrs: { src: image.src, alt: image.alt ?? "", caption: image.caption ?? "" },
              })
              .run();
          }
          return chain()
            .focus()
            .insertContent({
              type: typeName,
              content: [
                {
                  type: "galleryImage",
                  attrs: { src: image.src, alt: image.alt ?? "", caption: image.caption ?? "" },
                },
              ],
            })
            .run();
        },
    };
  },
});

export const GalleryImage = Node.create({
  name: "galleryImage",
  group: "galleryImage",
  inline: false,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-gallery-image]",
        getAttrs: (node: string | HTMLElement) => {
          if (!(node instanceof HTMLElement)) return false;
          const img = node.querySelector("img");
          const caption = node.querySelector("figcaption");
          return {
            src: img?.getAttribute("src") ?? "",
            alt: img?.getAttribute("alt") ?? "",
            caption: caption?.textContent ?? "",
          };
        },
      },
    ];
  },

  renderHTML({
    node,
    HTMLAttributes,
  }: {
    node: ProseMirrorNode;
    HTMLAttributes: Record<string, unknown>;
  }) {
    const caption = (node.attrs.caption as string) ?? "";
    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-gallery-image": "", class: "gallery-image" }),
      ["img", { src: node.attrs.src, alt: node.attrs.alt, loading: "lazy" }],
      caption ? ["figcaption", {}, caption] : ["figcaption", { "data-empty": "" }],
    ];
  },
});
