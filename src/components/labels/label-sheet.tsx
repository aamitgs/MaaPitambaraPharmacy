"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Printer } from "lucide-react";
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
import { BarcodeSvg } from "@/components/labels/barcode-svg";
import { fitModuleWidth } from "@/lib/barcode/code128";
import type { PlainBatch } from "@/lib/serialize";

/// The two label stocks Indian pharmacy printers actually ship with: a
/// 50×25mm roll for a thermal printer, and Avery-style 38.1×21.2mm on A4
/// for anyone printing on a normal office printer.
const SIZES = {
  "50x25": { label: "50 × 25 mm roll", w: 50, h: 25, barHeight: 9 },
  "38x21": { label: "38 × 21 mm A4 sheet", w: 38.1, h: 21.2, barHeight: 7 },
} as const;

/// Left and right margin inside the label. The barcode's own quiet zones
/// sit inside the symbol; this is the paper margin around all of it.
const LABEL_PADDING_MM = 3;

type SizeKey = keyof typeof SIZES;

export function LabelSheet({
  pharmacyName,
  itemName,
  barcode,
  batches,
}: {
  pharmacyName: string;
  itemName: string;
  barcode: string;
  batches: PlainBatch[];
}) {
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [count, setCount] = useState(12);
  const [size, setSize] = useState<SizeKey>("50x25");

  const batch = batches.find((b) => b.id === batchId);
  const spec = SIZES[size];
  const labels = Array.from({ length: Math.min(Math.max(count, 1), 200) });
  // Bars are sized to the label, not the other way round, and never below
  // the width at which a counter scanner starts misreading them.
  const fit = fitModuleWidth(barcode, spec.w - LABEL_PADDING_MM * 2);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1.5">
          <Label>Batch</Label>
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choose a batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.batchNo} · exp {format(new Date(b.expiryDate), "MMM yyyy")} · {b.currentQty} in
                  stock
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="count">How many</Label>
          <Input
            id="count"
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Label size</Label>
          <Select value={size} onValueChange={(v) => setSize(v as SizeKey)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SIZES).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => window.print()} disabled={!batch}>
          <Printer /> Print {labels.length}
        </Button>
      </div>

      {!batch && (
        <p className="text-sm text-muted-foreground print:hidden">
          Add a batch to this item before printing labels — the expiry and MRP come from it.
        </p>
      )}

      {batch && (
        <>
          {!fit.fits && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive print:hidden">
              This barcode needs {fit.widthMm.toFixed(1)}mm and the label only has{" "}
              {(spec.w - LABEL_PADDING_MM * 2).toFixed(1)}mm. Printing it any narrower would stop it
              scanning reliably — use the larger label stock.
            </p>
          )}
          <p className="text-xs text-muted-foreground print:hidden">
            Preview is shown at print size. Set your printer to 100% scale — &ldquo;fit to page&rdquo;
            resizes the bars and stops them scanning.
          </p>
          {/*
            Page size is declared per label stock. On a roll printer each
            label is its own page; on A4 the labels tile and the browser
            paginates them.
          */}
          <style>{`
            @media print {
              @page { size: ${size === "50x25" ? `${spec.w}mm ${spec.h}mm` : "A4"}; margin: ${size === "50x25" ? "0" : "8mm"}; }
              body * { visibility: hidden; }
              #label-sheet, #label-sheet * { visibility: visible; }
              #label-sheet { position: absolute; inset: 0; }
              .pharmacy-label { break-inside: avoid; page-break-inside: avoid; }
            }
          `}</style>
          <div
            id="label-sheet"
            className="flex flex-wrap gap-1 rounded-lg border bg-white p-2 print:gap-0 print:rounded-none print:border-0 print:p-0"
          >
            {labels.map((_, i) => (
              <div
                key={i}
                className="pharmacy-label flex flex-col items-center justify-center overflow-hidden border border-dashed border-neutral-300 px-1 text-center leading-tight text-black print:border-0"
                style={{ width: `${spec.w}mm`, height: `${spec.h}mm` }}
              >
                <div className="w-full truncate" style={{ fontSize: "5pt" }}>
                  {pharmacyName}
                </div>
                <div className="w-full truncate font-semibold" style={{ fontSize: "6.5pt" }}>
                  {itemName}
                </div>
                <BarcodeSvg
                  value={barcode}
                  heightMm={spec.barHeight}
                  moduleWidthMm={fit.moduleWidthMm}
                />
                <div style={{ fontSize: "5pt", letterSpacing: "0.04em" }}>{barcode}</div>
                <div className="flex w-full justify-between px-0.5" style={{ fontSize: "5pt" }}>
                  <span>B: {batch.batchNo}</span>
                  <span>E: {format(new Date(batch.expiryDate), "MM/yy")}</span>
                </div>
                <div className="font-semibold" style={{ fontSize: "6pt" }}>
                  MRP ₹{Number(batch.mrp).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
