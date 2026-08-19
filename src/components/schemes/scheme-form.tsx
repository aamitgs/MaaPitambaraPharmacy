"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createScheme, updateScheme, type SchemeInput } from "@/lib/actions/schemes";
import { Plus } from "lucide-react";

const formSchema = z.object({
  name: z.string().trim().min(1, "Scheme name is required"),
  type: z.enum(["percent_off", "buy_x_get_y"]),
  percent: z.coerce.number().min(0).max(100).optional(),
  buyQty: z.coerce.number().int().positive().optional(),
  getQty: z.coerce.number().int().positive().optional(),
  applicableItemIds: z.array(z.string()).default([]),
  validFrom: z.string().min(1, "Start date is required"),
  validTo: z.string().min(1, "End date is required"),
  active: z.boolean().default(true),
});

type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export interface SchemeDetail {
  id: string;
  name: string;
  type: "percent_off" | "buy_x_get_y";
  config: { percent?: number; buyQty?: number; getQty?: number; applicableItemIds?: string[] };
  validFrom: string;
  validTo: string;
  active: boolean;
}

export function SchemeForm({
  scheme,
  items,
  trigger,
}: {
  scheme?: SchemeDetail;
  items: { id: string; name: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: scheme?.name ?? "",
      type: scheme?.type ?? "percent_off",
      percent: scheme?.config.percent,
      buyQty: scheme?.config.buyQty,
      getQty: scheme?.config.getQty,
      applicableItemIds: scheme?.config.applicableItemIds ?? [],
      validFrom: scheme?.validFrom.slice(0, 10) ?? "",
      validTo: scheme?.validTo.slice(0, 10) ?? "",
      active: scheme?.active ?? true,
    },
  });

  const type = form.watch("type");
  const selectedItemIds = form.watch("applicableItemIds") ?? [];

  function toggleItem(itemId: string) {
    const current = form.getValues("applicableItemIds") ?? [];
    form.setValue(
      "applicableItemIds",
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  }

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        const input: SchemeInput = {
          name: values.name,
          type: values.type,
          config: {
            percent: values.type === "percent_off" ? values.percent : undefined,
            buyQty: values.type === "buy_x_get_y" ? values.buyQty : undefined,
            getQty: values.type === "buy_x_get_y" ? values.getQty : undefined,
            applicableItemIds: values.applicableItemIds,
          },
          validFrom: values.validFrom,
          validTo: values.validTo,
          active: values.active,
        };
        if (scheme) {
          await updateScheme(scheme.id, input);
          toast.success("Scheme updated");
        } else {
          await createScheme(input);
          toast.success("Scheme created");
          form.reset();
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> New scheme
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scheme ? "Edit scheme" : "New scheme"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Scheme name</Label>
            <Input id="name" autoFocus {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => form.setValue("type", v as FormValues["type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent_off">Percent off</SelectItem>
                <SelectItem value="buy_x_get_y">Buy X get Y free</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "percent_off" ? (
            <div className="space-y-1.5">
              <Label htmlFor="percent">Percent off</Label>
              <Input id="percent" type="number" min={0} max={100} {...form.register("percent")} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="buyQty">Buy qty</Label>
                <Input id="buyQty" type="number" min={1} {...form.register("buyQty")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="getQty">Get qty free</Label>
                <Input id="getQty" type="number" min={1} {...form.register("getQty")} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              Applies to{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (none selected = all items{type === "buy_x_get_y" ? " — pick at least one" : ""})
              </span>
            </Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {items.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedItemIds.includes(item.id)}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                  {item.name}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="validFrom">Valid from</Label>
              <Input id="validFrom" type="date" {...form.register("validFrom")} />
              {form.formState.errors.validFrom && (
                <p className="text-xs text-destructive">{form.formState.errors.validFrom.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validTo">Valid to</Label>
              <Input id="validTo" type="date" {...form.register("validTo")} />
              {form.formState.errors.validTo && (
                <p className="text-xs text-destructive">{form.formState.errors.validTo.message}</p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.watch("active")}
              onCheckedChange={(v) => form.setValue("active", !!v)}
            />
            Active
          </label>

          <Button type="submit" disabled={pending}>
            {scheme ? "Save changes" : "Create scheme"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
