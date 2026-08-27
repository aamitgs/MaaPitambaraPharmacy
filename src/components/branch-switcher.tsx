"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setSelectedBranch } from "@/lib/actions/branch-switch";
import { ALL_BRANCHES } from "@/lib/branch-constants";
import { Building2 } from "lucide-react";

export function BranchSwitcher({
  branches,
  selectedBranchId,
  isAllBranches,
  canViewAll,
}: {
  branches: { id: string; name: string }[];
  selectedBranchId: string | null;
  isAllBranches: boolean;
  canViewAll: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (branches.length === 0) return null;

  const value = isAllBranches ? ALL_BRANCHES : (selectedBranchId ?? branches[0]?.id);

  function handleChange(next: string) {
    startTransition(async () => {
      try {
        await setSelectedBranch(next);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not switch branch");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={value} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger size="sm" className="w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
          {canViewAll && <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  );
}
