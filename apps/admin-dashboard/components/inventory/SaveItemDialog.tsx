"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { Switch } from "@blush/ui/components/ui/switch";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { formatMoney } from "@blush/ui/lib/viz";
import { SaveCategoryDialog } from "@/components/inventory/SaveCategoryDialog";
import { SaveSupplierDialog } from "@/components/suppliers/SaveSupplierDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

const NONE = "none";

export type SaveableItem = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  categoryId: number | null;
  supplierId: number | null;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost: number;
  sellingPrice: number;
  isSellable: boolean;
  isActive: boolean;
};

/**
 * Creates or edits a stock item.
 *
 * Quantity is only editable on create, and even then it is booked as an
 * opening-balance movement rather than written straight to the column (§48).
 * Once an item exists, the only way its balance changes is through a movement,
 * so the ledger always explains the number on screen — which is why the field
 * turns into a read-only figure when editing.
 */
export function SaveItemDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: SaveableItem | null;
}) {
  const { can } = usePermissions();

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(NONE);
  const [supplierId, setSupplierId] = useState(NONE);
  const [reorderLevel, setReorderLevel] = useState("0");
  const [unitCost, setUnitCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [openingQuantity, setOpeningQuantity] = useState("0");
  const [isSellable, setIsSellable] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);

  useEffect(() => {
    setSku(editing?.sku ?? "");
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setCategoryId(editing?.categoryId ? String(editing.categoryId) : NONE);
    setSupplierId(editing?.supplierId ? String(editing.supplierId) : NONE);
    setReorderLevel(String(editing?.reorderLevel ?? 0));
    setUnitCost(editing ? editing.unitCost.toFixed(2) : "");
    setSellingPrice(editing ? editing.sellingPrice.toFixed(2) : "");
    setOpeningQuantity("0");
    setIsSellable(editing?.isSellable ?? true);
    setIsActive(editing?.isActive ?? true);
    setError(null);
  }, [open, editing]);

  const categories = trpc.inventory.categories.useQuery(undefined, { enabled: open });

  // Suppliers sit behind their own permission, so a storekeeper without it
  // still gets the rest of the form rather than a failed request.
  const canReadSuppliers = can("suppliers.read");
  const canWriteSuppliers = can("suppliers.write");
  const suppliers = trpc.inventory.suppliers.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: open && canReadSuppliers },
  );

  const save = trpc.inventory.saveItem.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedCost = Number(unitCost);
  const parsedPrice = Number(sellingPrice);
  const parsedReorder = Number(reorderLevel);
  const parsedOpening = Number(openingQuantity);

  const chosenCategoryName =
    categories.data?.find(row => String(row.id) === categoryId)?.name ?? "";

  const validation = useMemo(() => {
    if (sku.trim().length < 2) return "Give the item a SKU.";
    if (name.trim().length < 2) return "Give the item a name.";
    if (categoryId === NONE) return "Choose a category.";
    if (!Number.isFinite(parsedCost) || parsedCost < 0) return "Unit cost cannot be negative.";
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return "Selling price cannot be negative.";
    }
    if (!Number.isInteger(parsedReorder) || parsedReorder < 0) {
      return "Reorder level must be a whole number, 0 or more.";
    }
    if (!editing && (!Number.isInteger(parsedOpening) || parsedOpening < 0)) {
      return "Opening quantity must be a whole number, 0 or more.";
    }
    return null;
  }, [
    sku,
    name,
    categoryId,
    parsedCost,
    parsedPrice,
    parsedReorder,
    parsedOpening,
    editing,
  ]);

  // Sold below cost is legitimate (a clearance line) but almost always a typo,
  // so it warns rather than blocks.
  const marginWarning =
    isSellable && parsedPrice > 0 && parsedCost > 0 && parsedPrice < parsedCost
      ? `Selling at ${formatMoney(parsedPrice)} is below the ${formatMoney(parsedCost)} it costs.`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit item" : "New item"}</DialogTitle>
          <DialogDescription>
            One shared pool: the same stock serves the storefront, the classroom and the
            salon.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <div className="space-y-2">
              <Label htmlFor="item-sku">SKU</Label>
              <Input
                id="item-sku"
                value={sku}
                onChange={event => setSku(event.target.value)}
                placeholder="BWT-SERUM-01"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Lumina Renewal Serum"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-description">Description (optional)</Label>
            <Textarea
              id="item-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="item-category">Category</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto gap-1 px-2 py-0.5 text-xs"
                  onClick={() => setCategoryDialogOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  New
                </Button>
              </div>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="item-category">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.data?.length ? (
                    categories.data.map(category => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))
                  ) : (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      {categories.isLoading ? "Loading..." : "No categories yet - add one."}
                    </p>
                  )}
                </SelectContent>
              </Select>
            </div>

            {canReadSuppliers ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="item-supplier">Supplier (optional)</Label>
                  {canWriteSuppliers ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto gap-1 px-2 py-0.5 text-xs"
                      onClick={() => setSupplierDialogOpen(true)}
                    >
                      <Plus className="h-3 w-3" />
                      New
                    </Button>
                  ) : null}
                </div>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="item-supplier">
                    <SelectValue placeholder="No supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No supplier</SelectItem>
                    {(suppliers.data?.rows ?? []).map(supplier => (
                      <SelectItem key={supplier.id} value={String(supplier.id)}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="item-cost">Unit cost (GHS)</Label>
              <Input
                id="item-cost"
                inputMode="decimal"
                value={unitCost}
                onChange={event => setUnitCost(event.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-price">Selling price (GHS)</Label>
              <Input
                id="item-price"
                inputMode="decimal"
                value={sellingPrice}
                onChange={event => setSellingPrice(event.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-reorder">Reorder level</Label>
              <Input
                id="item-reorder"
                inputMode="numeric"
                value={reorderLevel}
                onChange={event => setReorderLevel(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Flagged as low at or below this.
              </p>
            </div>
          </div>

          {marginWarning ? (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {marginWarning}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="item-opening">Quantity on hand</Label>
            {editing ? (
              <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium tabular-nums text-foreground">
                  {editing.quantityOnHand}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  Changed through a stock movement, so the ledger explains every unit.
                </span>
              </div>
            ) : (
              <>
                <Input
                  id="item-opening"
                  inputMode="numeric"
                  value={openingQuantity}
                  onChange={event => setOpeningQuantity(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Booked as an opening-balance movement, not written straight to the count.
                </p>
              </>
            )}
          </div>

          <div className="space-y-3 rounded-xl bg-muted/50 p-3">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium text-foreground">Sold online</span>
                <span className="text-xs text-muted-foreground">
                  Appears in the storefront catalogue.
                </span>
              </span>
              <Switch checked={isSellable} onCheckedChange={setIsSellable} />
            </label>

            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium text-foreground">Active</span>
                <span className="text-xs text-muted-foreground">
                  Turn off to retire an item without losing its movement history.
                </span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>
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
            disabled={Boolean(validation) || save.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              save.mutate({
                id: editing?.id,
                sku: sku.trim(),
                name: name.trim(),
                description: description.trim() || undefined,
                // The legacy free-text column is kept in step with the chosen
                // category so older rows and new ones read the same.
                category: chosenCategoryName || "other",
                categoryId: Number(categoryId),
                supplierId: supplierId === NONE ? undefined : Number(supplierId),
                reorderLevel: parsedReorder,
                unitCost: parsedCost,
                sellingPrice: parsedPrice,
                isSellable,
                isActive,
                openingQuantity: editing ? undefined : parsedOpening,
              });
            }}
            className="gap-2"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Create item"}
          </Button>
        </DialogFooter>

        {/*
          Both pickers used to be dead ends: a category could only be created by
          a spreadsheet import, so a fresh install offered nothing to choose.
          These render into their own portals, so nesting them here is only a
          matter of where the state lives.
        */}
        <SaveCategoryDialog
          open={categoryDialogOpen}
          onOpenChange={setCategoryDialogOpen}
          onCreated={category => {
            // Selected only once the list holds it, otherwise the trigger falls
            // back to its placeholder until the refetch lands.
            void categories.refetch().then(() => setCategoryId(String(category.id)));
          }}
        />

        {canWriteSuppliers ? (
          <SaveSupplierDialog
            open={supplierDialogOpen}
            onOpenChange={setSupplierDialogOpen}
            onSaved={saved => {
              void suppliers.refetch().then(() => {
                if (saved.id) setSupplierId(String(saved.id));
              });
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
