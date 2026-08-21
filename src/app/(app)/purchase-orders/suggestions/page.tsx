import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { getReorderSuggestions } from "@/lib/actions/reorder";
import { ReorderSuggestions } from "@/components/purchasing/reorder-suggestions";

export default async function ReorderSuggestionsPage() {
  if (!(await hasPermission("purchasing.manage"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to raise orders</p>
      </div>
    );
  }
  const groups = await getReorderSuggestions();
  return <ReorderSuggestions groups={groups} />;
}
