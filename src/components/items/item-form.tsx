"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Sparkles, Loader2 } from "lucide-react";
import type { PlainItem } from "@/lib/serialize";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  genericName: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  composition: z.string().trim().optional(),
  scheduleClass: z.enum(["none", "H", "H1", "X", "G"]),
  hsnCode: z.string().trim().optional(),
  taxRate: z.coerce.number().min(0).max(100),
  unit: z.string().trim().min(1, "Unit is required"),
  packSize: z.string().trim().optional(),
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

export function ItemForm({ item }: { item?: PlainItem }) {
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
      composition: item?.composition ?? "",
      scheduleClass: item?.scheduleClass ?? "none",
      hsnCode: item?.hsnCode ?? "",
      taxRate: item ? Number(item.taxRate) : 12,
      unit: item?.unit ?? "unit",
      packSize: item?.packSize ?? "",
      reorderLevel: item?.reorderLevel ?? 10,
      imageUrl: item?.imageUrl ?? null,
    },
  });

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
          <Label htmlFor="composition">Composition</Label>
          <Input id="composition" {...form.register("composition")} />
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
          <Label htmlFor="taxRate">Tax rate (%)</Label>
          <Input id="taxRate" type="number" step="0.01" {...form.register("taxRate")} />
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
