"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";

/**
 * Adds a product category without leaving the item form.
 *
 * Categories previously only arrived through an import or the seed, so a fresh
 * install offered an empty dropdown and no way to fill it.
 */
export function SaveCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (category: { id: number; name: string; restored: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName("");
    setDescription("");
    setError(null);
  }, [open]);

  const create = trpc.inventory.createCategory.useMutation({
    onSuccess: category => {
      onOpenChange(false);
      onCreated(category);
    },
    onError: mutationError => setError(mutationError.message),
  });

  const validation = useMemo(
    () => (name.trim().length < 2 ? "Give the category a name." : null),
    [name],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
          <DialogDescription>
            Groups stock for the storefront and for reporting. Items keep their category
            when it is renamed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Skin care"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-description">Description (optional)</Label>
            <Textarea
              id="category-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={2}
              placeholder="Serums, cleansers, moisturisers"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(validation) || create.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              create.mutate({
                name: name.trim(),
                description: description.trim() || undefined,
              });
            }}
            className="gap-2"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
