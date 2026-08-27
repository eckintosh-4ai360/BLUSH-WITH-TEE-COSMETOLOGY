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
import { Switch } from "@blush/ui/components/ui/switch";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export type SaveableSupplier = {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  productsSupplied: string | null;
  notes: string | null;
  isActive: boolean;
};

/** Creates or edits a supplier. Balances owed are never edited here — they move only through receiving stock and paying. */
export function SaveSupplierDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: SaveableSupplier | null;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [productsSupplied, setProductsSupplied] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(editing?.name ?? "");
    setCompany(editing?.company ?? "");
    setPhone(editing?.phone ?? "");
    setWhatsapp(editing?.whatsapp ?? "");
    setEmail(editing?.email ?? "");
    setAddress(editing?.address ?? "");
    setProductsSupplied(editing?.productsSupplied ?? "");
    setNotes(editing?.notes ?? "");
    setIsActive(editing?.isActive ?? true);
    setError(null);
  }, [open, editing]);

  const save = trpc.inventory.saveSupplier.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const validation = useMemo(() => {
    if (name.trim().length < 2) return "Give the supplier a name.";
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return "That email address does not look right.";
    }
    return null;
  }, [name, email]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit supplier" : "New supplier"}</DialogTitle>
          <DialogDescription>
            Contact details and what they supply. What is owed to them is worked out from
            stock received and payments made.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplier-name">Contact name</Label>
              <Input
                id="supplier-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ama Mensah"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-company">Company (optional)</Label>
              <Input
                id="supplier-company"
                value={company}
                onChange={event => setCompany(event.target.value)}
                placeholder="Accra Beauty Wholesale"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input
                id="supplier-phone"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                placeholder="024 000 0000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-whatsapp">WhatsApp</Label>
              <Input
                id="supplier-whatsapp"
                value={whatsapp}
                onChange={event => setWhatsapp(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-email">Email</Label>
              <Input
                id="supplier-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-address">Address (optional)</Label>
            <Textarea
              id="supplier-address"
              value={address}
              onChange={event => setAddress(event.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-supplies">What they supply (optional)</Label>
            <Input
              id="supplier-supplies"
              value={productsSupplied}
              onChange={event => setProductsSupplied(event.target.value)}
              placeholder="Gel polish, builder gel, nail tools"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-notes">Notes (optional)</Label>
            <Textarea
              id="supplier-notes"
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={2}
              placeholder="Payment terms, delivery days, anything worth remembering"
            />
          </div>

          <label className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 p-3 text-sm">
            <span>
              <span className="block font-medium text-foreground">Active</span>
              <span className="text-xs text-muted-foreground">
                Turn off to stop offering them on new orders, keeping their history.
              </span>
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>

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
            disabled={Boolean(validation) || save.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              save.mutate({
                id: editing?.id,
                name: name.trim(),
                company: company.trim() || undefined,
                phone: phone.trim() || undefined,
                whatsapp: whatsapp.trim() || undefined,
                email: email.trim() || "",
                address: address.trim() || undefined,
                productsSupplied: productsSupplied.trim() || undefined,
                notes: notes.trim() || undefined,
                isActive,
              });
            }}
            className="gap-2"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Create supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
