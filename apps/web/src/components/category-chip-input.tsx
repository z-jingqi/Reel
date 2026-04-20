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

interface Category {
  id: number;
  name: string;
  slug: string;
}

export function CategoryChipInput({
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
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ categories: Category[] }>("/categories"),
  });
  const categories = data?.categories ?? [];

  const create = useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ category: Category }>("/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: ({ category }) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onChange([...selected, category.id]);
      setSearch("");
    },
  });

  const selectedCategories = categories.filter((c) => selected.includes(c.id));

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const showCreate =
    search.trim().length > 0 &&
    !categories.some((c) => c.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedCategories.map((c) => (
        <Badge key={c.id} variant="outline" className="gap-1">
          {c.name}
          <button
            type="button"
            onClick={() => toggle(c.id)}
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
            Add category
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
              <CommandEmpty>No categories match.</CommandEmpty>
              <CommandGroup>
                {categories.map((c) => (
                  <CommandItem key={c.id} value={c.name} onSelect={() => toggle(c.id)}>
                    <span className="flex-1">{c.name}</span>
                    {selected.includes(c.id) && (
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
