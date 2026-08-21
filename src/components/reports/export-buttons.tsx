import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";

/**
 * CSV and Excel side by side.
 *
 * Both, rather than Excel only: CSV is what an accountant's software
 * imports and what a script can read, while Excel is what someone opens
 * to look at. Replacing one with the other would break somebody's habit.
 */
export function ExportButtons({
  href,
  label = "Export",
}: {
  /** The export route with its query string, without a `format` param. */
  href: string;
  label?: string;
}) {
  const join = href.includes("?") ? "&" : "?";
  return (
    <div className="flex gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={href}>
          <Download className="h-4 w-4" /> {label} CSV
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`${href}${join}format=xlsx`}>
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </a>
      </Button>
    </div>
  );
}
