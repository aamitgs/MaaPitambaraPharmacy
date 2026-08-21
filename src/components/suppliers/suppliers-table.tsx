"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PlainSupplier } from "@/lib/serialize";

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, PlainSupplier>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Supplier",
    cell: ({ row }) => (
      <Link href={`/suppliers/${row.original.id}`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  }),
  columnHelper.accessor("phone", {
    header: "Phone",
    cell: ({ row }) =>
      row.original.phone ? (
        <a href={`tel:${row.original.phone}`} className="hover:underline">
          {row.original.phone}
        </a>
      ) : (
        "—"
      ),
  }),
  columnHelper.accessor("gstin", {
    header: "GSTIN",
    cell: ({ row }) => row.original.gstin || "—",
  }),
  columnHelper.accessor("paymentTermsDays", {
    header: "Payment terms",
    cell: ({ row }) =>
      row.original.paymentTermsDays != null ? `${row.original.paymentTermsDays} days` : "—",
  }),
  columnHelper.accessor("outstandingBalance", {
    header: "Outstanding",
    cell: ({ row }) => (
      <span
        className={cn(
          "tabular-nums",
          row.original.outstandingBalance > 0 && "font-medium text-destructive"
        )}
      >
        ₹{row.original.outstandingBalance.toFixed(2)}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Link
        href={`/suppliers/${row.original.id}/edit`}
        className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Edit
      </Link>
    ),
  }),
]);

export function SuppliersTable({ suppliers }: { suppliers: PlainSupplier[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.gstin?.toLowerCase().includes(q) ?? false) ||
        (s.phone?.toLowerCase().includes(q) ?? false)
    );
  }, [suppliers, search]);

  const table = useTable({ features, columns, data: filtered });

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search suppliers by name, phone or GSTIN…"
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
                  No suppliers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
