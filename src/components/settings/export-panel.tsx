import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const EXPORTS = [
  { href: "/api/export/items", label: "Item master" },
  { href: "/api/export/batches", label: "Batch / stock" },
  { href: "/api/export/suppliers", label: "Suppliers" },
  { href: "/api/export/customers", label: "Customers" },
  { href: "/api/export/sales", label: "Sales register" },
] as const;

export function ExportPanel() {
  return (
    <div className="max-w-md space-y-4">
      <div>
        <h2 className="text-sm font-medium">Export CSV</h2>
        <p className="text-sm text-muted-foreground">
          Download a plain CSV snapshot for spreadsheets or another system.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {EXPORTS.map((e) => (
          <Button key={e.href} asChild variant="outline" className="justify-start">
            <a href={e.href} download>
              <Download className="h-4 w-4" /> {e.label}
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}
