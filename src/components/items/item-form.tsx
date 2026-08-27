"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { describeComposition } from "@/lib/composition";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createItem, updateItem, type ItemInput } from "@/lib/actions/items";
import { AttachmentUpload } from "@/components/attachment-upload";
import { readItemPhoto } from "@/lib/actions/vision";
import { Sparkles, Loader2, CircleCheck, CircleAlert } from "lucide-react";
import type { PlainItem } from "@/lib/serialize";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  genericName: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  supplierId: z.string().optional(),
  composition: z.string().trim().optional(),
  scheduleClass: z.enum(["none", "H", "H1", "X", "G"]),
  hsnCode: z.string().trim().optional(),
  barcode: z.string().trim().max(64).optional(),
  taxRate: z.coerce.number().min(0).max(100),
  taxSlabId: z.string().optional(),
  unit: z.string().trim().min(1, "Unit is required"),
  packSize: z.string().trim().optional(),
  unitsPerPack: z.coerce.number().int().min(1).max(1000),
  allowLooseSale: z.boolean(),
  reorderLevel: z.coerce.number().int().min(0),
  imageUrl: z.string().nullish(),
});

// zod v4 gives coerce.number() an `unknown` input type distinct from its
// `number` output type, so the form's field type (pre-coercion, used by
// defaultValues/register) and the resolver's transformed output type
// (post-coercion, used by onSubmit) have to be threaded through separately —
// see react-hook-form's 3rd useForm generic (TTransformedValues).
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export function ItemForm({
  item,
  taxSlabs = [],
  suppliers = [],
}: {
  item?: PlainItem;
  /** Loaded server-side; empty until the pharmacy defines any. */
  taxSlabs?: { id: string; name: string; currentRate: number | null }[];
  /** Loaded server-side — who this item can be reordered from. */
  suppliers?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reading, startReading] = useTransition();

  // Fills blanks only — never overwrites something a person already typed.
  // Everything stays editable; nothing is saved until the form is submitted.
  function fillFromPhoto() {
    const path = form.getValues("imageUrl");
    if (!path) return;
    startReading(async () => {
      const result = await readItemPhoto(path);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const filled: string[] = [];
      for (const [key, value] of Object.entries(result.fields)) {
        if (value === null || value === "") continue;
        const field = key as keyof FormValues;
        const current = form.getValues(field);
        if (current !== "" && current !== undefined && current !== null) continue;
        form.setValue(field, value as never, { shouldDirty: true });
        filled.push(key);
      }
      toast.success(
        filled.length
          ? `Filled ${filled.length} blank field${filled.length > 1 ? "s" : ""} — check them before saving`
          : "Nothing new to fill — the blank fields weren't legible"
      );
    });
  }

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: item?.name ?? "",
      genericName: item?.genericName ?? "",
      manufacturer: item?.manufacturer ?? "",
      supplierId: item?.supplierId ?? "",
      composition: item?.composition ?? "",
      scheduleClass: item?.scheduleClass ?? "none",
      hsnCode: item?.hsnCode ?? "",
      barcode: item?.barcode ?? "",
      taxRate: item ? Number(item.taxRate) : 12,
      taxSlabId: item?.taxSlabId ?? "",
      unit: item?.unit ?? "unit",
      packSize: item?.packSize ?? "",
      unitsPerPack: item?.unitsPerPack ?? 1,
      allowLooseSale: item?.allowLooseSale ?? false,
      reorderLevel: item?.reorderLevel ?? 10,
      imageUrl: item?.imageUrl ?? null,
    },
  });

  const compositionText = form.watch("composition") ?? "";
  const readable = describeComposition(compositionText);

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        if (item) {
          await updateItem(item.id, values as ItemInput);
          toast.success("Item updated");
          router.push(`/items/${item.id}`);
        } else {
          const created = await createItem(values as ItemInput);
          toast.success("Item created");
          router.push(`/items/${created.id}`);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoFocus {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="genericName">Generic name</Label>
          <Input id="genericName" {...form.register("genericName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manufacturer">Manufacturer</Label>
          <Input id="manufacturer" {...form.register("manufacturer")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supplierId">Supplier</Label>
          <select
            id="supplierId"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            {...form.register("supplierId")}
          >
            <option value="">No preferred supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="composition">Composition</Label>
          <Input
            id="composition"
            placeholder="Paracetamol 500mg + Caffeine 30mg"
            {...form.register("composition")}
          />
          {/*
            Told here rather than discovered later. Whether a composition
            can be matched depends only on the strengths being written
            down, which is a pure check — no round-trip, no waiting.
          */}
          {compositionText.trim() ? (
            readable ? (
              <p className="flex items-start gap-1 text-[11px] text-success">
                <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" />
                Reads as {readable} — substitutes will match on this.
              </p>
            ) : (
              <p className="flex items-start gap-1 text-[11px] text-warning-foreground">
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                Every ingredient needs a strength, or this item will not be offered as a
                substitute. It still saves.
              </p>
            )
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Schedule class</Label>
          <Select
            value={form.watch("scheduleClass")}
            onValueChange={(v) => form.setValue("scheduleClass", v as FormValues["scheduleClass"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="H">H</SelectItem>
              <SelectItem value="H1">H1</SelectItem>
              <SelectItem value="X">X</SelectItem>
              <SelectItem value="G">G</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hsnCode">HSN code</Label>
          <Input id="hsnCode" {...form.register("hsnCode")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="barcode">Barcode</Label>
          <Input
            id="barcode"
            placeholder="Scan the pack, or type the EAN"
            {...form.register("barcode")}
          />
          <p className="text-[11px] text-muted-foreground">
            Lets the till add this item by scanning. Leave blank if the pack has no code.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="taxSlabId">GST slab</Label>
          <select
            id="taxSlabId"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            {...form.register("taxSlabId")}
          >
            <option value="">Resolve from HSN code</option>
            {taxSlabs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.currentRate !== null ? ` — ${s.currentRate}%` : " — no rate set"}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Leave on &ldquo;resolve from HSN&rdquo; unless this item is an exception. Setting a
            slab here overrides the HSN mapping.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="taxRate">Fallback tax rate (%)</Label>
          <Input id="taxRate" type="number" step="0.01" {...form.register("taxRate")} />
          <p className="text-[11px] text-muted-foreground">
            Only used when neither a slab nor an HSN mapping applies.
          </p>
          {form.formState.errors.taxRate && (
            <p className="text-xs text-destructive">{form.formState.errors.taxRate.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" placeholder="strip, bottle, unit…" {...form.register("unit")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="packSize">Pack size</Label>
          <Input id="packSize" placeholder="10 tablets" {...form.register("packSize")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unitsPerPack">Units per pack</Label>
          <Input
            id="unitsPerPack"
            type="number"
            min={1}
            {...form.register("unitsPerPack")}
          />
          <p className="text-[11px] text-muted-foreground">
            How many sellable units are in one pack — 10 for a strip of ten tablets. Leave at 1
            for a bottle or a tube.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="flex items-start gap-2.5 rounded-lg border p-3">
            <input
              type="checkbox"
              className="mt-0.5"
              {...form.register("allowLooseSale")}
            />
            <span>
              <span className="text-sm font-medium">Can be sold loose</span>
              <span className="block text-[11px] text-muted-foreground">
                Lets the counter break a pack and sell single units. Off by default — a strip
                broken by mistake cannot be un-broken.
              </span>
            </span>
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reorderLevel">Reorder level</Label>
          <Input id="reorderLevel" type="number" {...form.register("reorderLevel")} />
        </div>
        {/* Registered through the form so the path is submitted with the
            rest of the values rather than needing its own save. */}
        <div className="space-y-2">
          <AttachmentUpload
            label="Item photo (optional)"
            endpoint="/api/uploads/item-photo"
            path={form.watch("imageUrl") ?? null}
            onPathChange={(p) => form.setValue("imageUrl", p, { shouldDirty: true })}
            buttonLabel="Attach photo"
            previewAlt="Item photo preview"
          />
          {form.watch("imageUrl") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reading}
              onClick={fillFromPhoto}
            >
              {reading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Fill from photo
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {item ? "Save changes" : "Create item"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
