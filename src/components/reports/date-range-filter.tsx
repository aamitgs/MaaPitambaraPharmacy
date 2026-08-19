"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateRangeFilter({
  from,
  to,
  basePath,
}: {
  from: string;
  to: string;
  basePath: string;
}) {
  const router = useRouter();
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);

  function apply() {
    router.push(`${basePath}?from=${localFrom}&to=${localTo}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <div className="space-y-1.5">
        <Label htmlFor="rangeFrom" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id="rangeFrom"
          type="date"
          value={localFrom}
          onChange={(e) => setLocalFrom(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rangeTo" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input id="rangeTo" type="date" value={localTo} onChange={(e) => setLocalTo(e.target.value)} />
      </div>
      <Button size="sm" onClick={apply}>
        Apply
      </Button>
    </div>
  );
}
