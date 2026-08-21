"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";

/**
 * Sits under Backup and is deliberately worded to be unmistakable from it.
 * The dangerous option — including patient details — is off by default and
 * has to be ticked each time; it is not remembered.
 */
export function DataWorkbookPanel() {
  const [includePersonal, setIncludePersonal] = useState(false);

  return (
    <div className="max-w-2xl space-y-3">
      <div>
        <h2 className="text-sm font-medium">Readable copy of your data (Excel)</h2>
        <p className="text-sm text-muted-foreground">
          One sheet per table, for your accountant or your own reference. Credentials are never
          included.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
        <div className="space-y-1 text-xs">
          <p className="font-medium text-foreground">This is not a backup.</p>
          <p className="text-muted-foreground">
            It cannot be restored into the system — use <span className="font-medium">Backup
            now</span> above for that. This file is also <span className="font-medium">not
            encrypted</span>: anyone who opens it can read it.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border p-3">
        <Checkbox
          checked={includePersonal}
          onCheckedChange={(v) => setIncludePersonal(Boolean(v))}
          className="mt-0.5"
        />
        <div>
          <div className="text-sm font-medium">Include patient and customer details</div>
          <p className="text-[11px] text-muted-foreground">
            Off by default. With this ticked the file contains patient names, phone numbers and
            addresses in plain text — an accountant almost never needs those, and a file without
            them is far less damaging if it goes astray. Every export is recorded in the audit
            log either way.
          </p>
        </div>
      </label>

      <Button asChild variant="outline">
        <a
          href={`/api/export/data-workbook${includePersonal ? "?personal=include" : ""}`}
          download
        >
          <FileSpreadsheet className="h-4 w-4" />
          Download {includePersonal ? "with" : "without"} personal details
        </a>
      </Button>
    </div>
  );
}
