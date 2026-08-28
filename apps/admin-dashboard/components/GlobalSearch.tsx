"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@blush/ui/components/ui/command";
import { Kbd } from "@blush/ui/components/ui/kbd";
import { trpc } from "@/lib/trpc";

/**
 * One box that resolves any reference in the system (§61): a student number,
 * an order number, a certificate number, a person, or a product SKU.
 *
 * Results are permission-filtered on the server, so this never surfaces a
 * record the caller could not open anyway.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = trpc.dashboard.search.useQuery(
    { term: debounced },
    { enabled: debounced.length >= 2, staleTime: 30_000 }
  );

  const groups = useMemo(() => {
    const data = results.data;
    if (!data) return [];
    return [
      { heading: "Students", rows: data.students },
      { heading: "Applications", rows: data.applications },
      { heading: "Orders", rows: data.orders },
      { heading: "Products", rows: data.products },
      { heading: "Customers", rows: data.customers },
      { heading: "Certificates", rows: data.certificates },
    ].filter(group => group.rows.length > 0);
  }, [results.data]);

  const go = (href: string) => {
    setOpen(false);
    setTerm("");
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-md items-center gap-2 rounded-xl border border-white/70 bg-white/45 px-3 py-2 text-left text-sm text-muted-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">
          Search students, orders, products...
        </span>
        <Kbd className="hidden sm:inline-flex">Ctrl K</Kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Search by name, reference, SKU or number..."
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          {debounced.length < 2 ? (
            <CommandEmpty>Type at least two characters.</CommandEmpty>
          ) : results.isLoading ? (
            <CommandEmpty>Searching...</CommandEmpty>
          ) : !groups.length ? (
            <CommandEmpty>
              Nothing matched &ldquo;{debounced}&rdquo;.
            </CommandEmpty>
          ) : (
            groups.map(group => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.rows.map(row => (
                  <CommandItem
                    key={`${group.heading}-${row.id}`}
                    value={`${group.heading}-${row.id}`}
                    onSelect={() => go(row.href)}
                    className="cursor-pointer"
                  >
                    {row.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
