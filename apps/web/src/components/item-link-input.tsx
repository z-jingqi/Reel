import type { ItemKind } from "@reel/shared";
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

interface ItemRow {
  id: number;
  kind: ItemKind;
  title: string;
  year: number | null;
}

export function ItemLinkInput({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["items"],
    queryFn: () => apiFetch<{ items: ItemRow[] }>("/items"),
  });
  const items = data?.items ?? [];
  const selectedItems = items.filter((i) => selected.includes(i.id));

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedItems.map((i) => (
        <Badge key={i.id} variant="secondary" className="gap-1">
          <span className="text-[10px] uppercase text-muted-foreground">{i.kind}</span>
          {i.title}
          {i.year && <span className="text-muted-foreground">({i.year})</span>}
          <button
            type="button"
            onClick={() => toggle(i.id)}
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
            Link item
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search your library…" />
            <CommandList>
              <CommandEmpty>No items found.</CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.title} ${item.kind} ${item.year ?? ""}`}
                    onSelect={() => toggle(item.id)}
                  >
                    <span className="mr-2 w-10 shrink-0 text-[10px] uppercase text-muted-foreground">
                      {item.kind}
                    </span>
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.year && (
                      <span className="ml-2 text-xs text-muted-foreground">{item.year}</span>
                    )}
                    {selected.includes(item.id) && (
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
