"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
import { toast } from "@blush/ui/components/ui/sonner";
import { trpc } from "@/lib/trpc";

// Adds and renames blog categories. A category is only listed on the website once it has a post.
export function BlogCategoriesDialog({
  open,
  onOpenChange,
  writable,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  writable: boolean;
  onChanged: () => void;
}) {
  const categories = trpc.cms.blogCategories.useQuery(undefined, { enabled: open });
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const save = trpc.cms.saveBlogCategory.useMutation({
    onSuccess: (_, input) => {
      toast.success(input.id ? "Category renamed." : "Category added.");
      setNewName("");
      setEditingId(null);
      void categories.refetch();
      onChanged();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Blog categories</DialogTitle>
          <DialogDescription>
            Readers can filter the blog by category. A category shows on the website once a published
            post uses it.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60">
          {categories.isLoading ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>
          ) : !categories.data?.length ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No categories yet.</li>
          ) : (
            categories.data.map(category => (
              <li key={category.id} className="flex items-center gap-2 px-3 py-1.5">
                {editingId === category.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={event => setEditingName(event.target.value)}
                      className="h-8"
                      autoFocus
                      aria-label="Category name"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      aria-label="Save the name"
                      disabled={save.isPending || editingName.trim().length < 2}
                      onClick={() => save.mutate({ id: category.id, name: editingName.trim() })}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      aria-label="Cancel"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{category.name}</span>
                    {writable ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        aria-label={`Rename ${category.name}`}
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </>
                )}
              </li>
            ))
          )}
        </ul>

        {writable ? (
          <form
            className="flex gap-2"
            onSubmit={event => {
              event.preventDefault();
              if (newName.trim().length >= 2) save.mutate({ name: newName.trim() });
            }}
          >
            <Input
              value={newName}
              onChange={event => setNewName(event.target.value)}
              placeholder="e.g. Career advice"
              aria-label="New category name"
            />
            <Button type="submit" className="shrink-0 gap-1.5" disabled={save.isPending || newName.trim().length < 2}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
