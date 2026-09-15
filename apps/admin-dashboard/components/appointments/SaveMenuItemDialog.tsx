"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Checkbox } from "@blush/ui/components/ui/checkbox";
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

export type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  isBookable: boolean;
  isActive: boolean;
};

// Adds a service to the menu the website books from, or corrects one.
export function SaveMenuItemDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: MenuItem | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("60");
  const [price, setPrice] = useState("");
  const [isBookable, setIsBookable] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setDuration(String(editing?.durationMinutes ?? 60));
    setPrice(editing ? String(editing.price) : "");
    setIsBookable(editing?.isBookable ?? true);
    setIsActive(editing?.isActive ?? true);
    setError(null);
  }, [open, editing]);

  const save = trpc.services.saveMenuItem.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    const minutes = Number(duration);
    const amount = Number(price);
    if (name.trim().length < 2) return setError("Name the service.");
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) {
      return setError("The duration must be a whole number of minutes, from 5 to 720.");
    }
    if (!price.trim() || !Number.isFinite(amount) || amount < 0) {
      return setError("Enter the price, as a number that is not negative.");
    }
    save.mutate({
      id: editing?.id,
      name: name.trim(),
      description: description.trim() || undefined,
      durationMinutes: minutes,
      price: amount,
      isBookable,
      isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : "Add a service"}</DialogTitle>
          <DialogDescription>
            The name, price and length the website shows on the booking page. Bookings already made keep the
            service they were made for.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="menu-name">Service</Label>
            <Input
              id="menu-name"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="e.g. Knotless braids"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="menu-description">Description (optional)</Label>
            <Textarea
              id="menu-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="What the client gets, in a sentence or two."
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="menu-price">Price (GHS)</Label>
              <Input
                id="menu-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={price}
                onChange={event => setPrice(event.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu-duration">Duration (minutes)</Label>
              <Input
                id="menu-duration"
                type="number"
                inputMode="numeric"
                min={5}
                max={720}
                step={5}
                value={duration}
                onChange={event => setDuration(event.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3">
            <Checkbox
              checked={isBookable}
              onCheckedChange={checked => setIsBookable(checked === true)}
              aria-label="Offer this service for online booking"
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="block font-medium text-foreground">Bookable on the website</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Left off, staff can still use it for bookings and the daily services log.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3">
            <Checkbox
              checked={isActive}
              onCheckedChange={checked => setIsActive(checked === true)}
              aria-label="Keep this service on the menu"
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="block font-medium text-foreground">On the menu</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Hidden services disappear from every picker but stay on past bookings.
              </span>
            </span>
          </label>

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button className="gap-2" onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Add service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
