"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MoverFilters({
  from,
  to,
  threshold,
}: {
  from: string;
  to: string;
  threshold: number;
}) {
  const router = useRouter();
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);
  const [localThreshold, setLocalThreshold] = useState(String(threshold));

  function apply() {
    router.push(`/reports/movers?from=${localFrom}&to=${localTo}&threshold=${localThreshold}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <div className="space-y-1.5">
        <Label htmlFor="moverFrom" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input id="moverFrom" type="date" value={localFrom} onChange={(e) => setLocalFrom(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="moverTo" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input id="moverTo" type="date" value={localTo} onChange={(e) => setLocalTo(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="moverThreshold" className="text-xs text-muted-foreground">
          Slow mover threshold (units sold)
        </Label>
        <Input
          id="moverThreshold"
          type="number"
          min={0}
          className="w-40"
          value={localThreshold}
          onChange={(e) => setLocalThreshold(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={apply}>
        Apply
      </Button>
    </div>
  );
}
