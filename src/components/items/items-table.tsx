"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ItemWithFlags } from "./types";

// No sorting/column-filtering feature needed — search is a plain substring
// match applied to `data` below, so the table itself only needs the core
// (automatic) row model.
const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, ItemWithFlags>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Item",
    cell: ({ row }) => (
      <div>
        <Link href={`/items/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
        {row.original.genericName && (
          <div className="text-xs text-muted-foreground">{row.original.genericName}</div>
        )}
      </div>
    ),
  }),
  columnHelper.accessor("manufacturer", {
    header: "Manufacturer",
    cell: ({ row }) => row.original.manufacturer || "—",
  }),
  columnHelper.accessor("scheduleClass", {
    header: "Schedule",
    cell: ({ row }) =>
      row.original.scheduleClass === "none" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Badge variant="outline">{row.original.scheduleClass}</Badge>
      ),
  }),
  columnHelper.accessor("taxRate", {
    header: "Tax %",
    cell: ({ row }) => `${row.original.taxRate}%`,
  }),
  columnHelper.display({
    id: "stock",
    header: "Stock",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "tabular-nums",
            row.original.outOfStock && "font-medium text-destructive"
          )}
        >
          {row.original.totalQty}
        </span>
        <span className="text-xs text-muted-foreground">/ {row.original.reorderLevel}</span>
      </div>
    ),
  }),
  columnHelper.display({
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const it = row.original;
      const badges: React.ReactNode[] = [];
      if (it.outOfStock) {
        badges.push(
          <Badge key="oos" className="bg-destructive/10 text-destructive hover:bg-destructive/10">
            Out of stock
          </Badge>
        );
      } else if (it.lowStock) {
        badges.push(
          <Badge key="low" className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
            Low stock
          </Badge>
        );
      }
      if (it.hasExpired) {
        badges.push(
          <Badge key="exp" className="bg-destructive/10 text-destructive hover:bg-destructive/10">
            Expired batch
          </Badge>
        );
      } else if (it.hasNearExpiry) {
        badges.push(
          <Badge key="nexp" className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
            Near expiry
          </Badge>
        );
      }
      return badges.length ? (
        <div className="flex flex-wrap gap-1">{badges}</div>
      ) : (
        <Badge className="bg-success/15 text-success hover:bg-success/15">OK</Badge>
      );
    },
  }),
]);

export function ItemsTable({ items }: { items: ItemWithFlags[] }) {
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.genericName?.toLowerCase().includes(q) ?? false) ||
        (it.manufacturer?.toLowerCase().includes(q) ?? false)
    );
  }, [items, search]);

  const table = useTable({ features, columns, data: filteredItems });

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search items by name, generic name, or manufacturer…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        autoFocus
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
