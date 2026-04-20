import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

interface Tag {
  id: number;
  name: string;
  slug: string;
}

export function TagChipInput({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["tags"],
    queryFn: () => apiFetch<{ tags: Tag[] }>("/tags"),
  });
  const tags = data?.tags ?? [];

  const create = useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ tag: Tag }>("/tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: ({ tag }) => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      onChange([...selected, tag.id]);
      setSearch("");
    },
  });

  const selectedTags = tags.filter((t) => selected.includes(t.id));

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const showCreate =
    search.trim().length > 0 &&
    !tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedTags.map((tag) => (
        <Badge key={tag.id} variant="secondary" className="gap-1">
          {tag.name}
          <button
            type="button"
            onClick={() => toggle(tag.id)}
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
            Add tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search or create…"
            />
            <CommandList>
              <CommandEmpty>No tags match.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    onSelect={() => toggle(tag.id)}
                  >
                    <span className="flex-1">{tag.name}</span>
                    {selected.includes(tag.id) && (
                      <span className="text-xs text-muted-foreground">✓</span>
                    )}
                  </CommandItem>
                ))}
                {showCreate && (
                  <CommandItem
                    value={`__create-${search}`}
                    onSelect={() => create.mutate(search.trim())}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create “{search.trim()}”
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
