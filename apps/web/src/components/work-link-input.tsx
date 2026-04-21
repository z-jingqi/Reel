import type { WorkKind } from "@reel/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import { apiFetch } from "../api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface WorkRow {
  id: number;
  kind: WorkKind;
  title: string;
  year: number | null;
}

export function WorkLinkInput({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["works"],
    queryFn: () => apiFetch<{ works: WorkRow[] }>("/works"),
  });
  const works = data?.works ?? [];
  const selectedWorks = works.filter((w) => selected.includes(w.id));

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedWorks.map((w) => (
        <Badge key={w.id} variant="secondary" className="gap-1">
          <span className="text-[10px] uppercase text-muted-foreground">{w.kind}</span>
          {w.title}
          {w.year && <span className="text-muted-foreground">({w.year})</span>}
          <button
            type="button"
            onClick={() => toggle(w.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
            <Plus className="h-3 w-3" />
            Link work
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search your library…" />
            <CommandList>
              <CommandEmpty>No works found.</CommandEmpty>
              <CommandGroup>
                {works.map((work) => (
                  <CommandItem
                    key={work.id}
                    value={`${work.title} ${work.kind} ${work.year ?? ""}`}
                    onSelect={() => toggle(work.id)}
                  >
                    <span className="mr-2 w-10 shrink-0 text-[10px] uppercase text-muted-foreground">
                      {work.kind}
                    </span>
                    <span className="flex-1 truncate">{work.title}</span>
                    {work.year && (
                      <span className="ml-2 text-xs text-muted-foreground">{work.year}</span>
                    )}
                    {selected.includes(work.id) && (
                      <span className="ml-2 text-xs text-muted-foreground">✓</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
