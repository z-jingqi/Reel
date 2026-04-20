import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export function ResizeHandle({
  onResize,
  getCurrent,
  min = 280,
  max = 800,
  className,
}: {
  /** Called with the new width while dragging. */
  onResize: (width: number) => void;
  /** Returns the current width when drag starts. */
  getCurrent: () => number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const draggingRef = useRef(false);

  useEffect(() => () => {
    // Safety: clean up any listeners if the component unmounts mid-drag.
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startWidth = getCurrent();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent) {
      if (!draggingRef.current) return;
      // Handle sits on the LEFT edge of a right-docked panel.
      // Moving the mouse left increases the panel width.
      const delta = startX - ev.clientX;
      const next = Math.min(Math.max(startWidth + delta, min), max);
      onResize(next);
    }

    function onUp() {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className={cn(
        "group relative flex h-full w-1 shrink-0 cursor-col-resize items-center justify-center bg-border transition-colors hover:bg-primary/40 active:bg-primary",
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
