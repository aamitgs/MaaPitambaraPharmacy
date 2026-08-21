"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { quickAddCustomer } from "@/lib/actions/pos";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BillingResult } from "@/lib/billing";
import type { AppliedCoupon } from "@/store/cart-store";
import type { PosCustomer } from "./types";
import type { PaymentMode } from "@/generated/prisma/client";
import { Loader2, Tag, X } from "lucide-react";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit" },
];

export function BottomBar({
  billing,
  billDiscountValue,
  billDiscountIsPercent,
  onBillDiscountChange,
  customers,
  customerId,
  onCustomerCreated,
  onCustomerChange,
  paymentMode,
  onPaymentModeChange,
  onCompleteSale,
  submitting,
  blockedReason,
  appliedCoupon,
  couponInput,
  onCouponInputChange,
  onApplyCoupon,
  onRemoveCoupon,
  couponError,
  couponChecking,
  holdControls,
  creditHeadroom,
}: {
  /** The Hold / Held pair, passed in so this bar stays presentational. */
  holdControls?: React.ReactNode;
  /** Remaining credit for the selected customer; null when not on credit. */
  creditHeadroom?: number | null;
  billing: BillingResult;
  billDiscountValue: number;
  billDiscountIsPercent: boolean;
  onBillDiscountChange: (value: number, isPercent: boolean) => void;
  customers: PosCustomer[];
  customerId: string | null;
  onCustomerCreated: (customer: PosCustomer) => void;
  onCustomerChange: (id: string | null) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (mode: PaymentMode) => void;
  onCompleteSale: () => void;
  submitting: boolean;
  blockedReason: string | null;
  appliedCoupon: AppliedCoupon | null;
  couponInput: string;
  onCouponInputChange: (v: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  couponError: string | null;
  couponChecking: boolean;
}) {
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [savingCustomer, startSaveCustomer] = useTransition();

  function submitQuickAddCustomer() {
    if (!newCustomerName.trim()) return;
    startSaveCustomer(async () => {
      try {
        const customer = await quickAddCustomer({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || undefined,
        });
        onCustomerCreated(customer);
        onCustomerChange(customer.id);
        setQuickAddOpen(false);
        setNewCustomerName("");
        setNewCustomerPhone("");
        toast.success("Customer added");
      } catch {
        toast.error("Could not add customer");
      }
    });
  }
  const creditEligible = !!selectedCustomer && selectedCustomer.creditLimit !== null;
  const loyaltyDiscount = billing.billDiscounts.find((d) => d.type === "loyalty");
  const couponDiscount = billing.billDiscounts.find((d) => d.type === "coupon");

  return (
    <div className="sticky bottom-0 z-30 border-t bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-[1fr_auto] gap-6 p-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Customer (optional)</Label>
            <div className="flex gap-1">
              <Select
                value={customerId ?? "__none"}
                onValueChange={(v) => onCustomerChange(v === "__none" ? null : v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Walk-in" />
                </SelectTrigger>
                <SelectContent>
                  {/* Walk-in stays the default: most counter sales are
                      anonymous, and naming a customer is the exception. */}
                  <SelectItem value="__none">Walk-in</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone ? `· ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setQuickAddOpen(true)}
                aria-label="Add new customer"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {selectedCustomer?.loyaltyTierName && (
              <p className="text-[11px] text-success">
                {selectedCustomer.loyaltyTierName} tier — {selectedCustomer.loyaltyDiscountPercent}% loyalty discount
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Bill discount</Label>
            <div className="flex gap-1">
              <Input
                type="number"
                min={0}
                className="h-8"
                value={billDiscountValue}
                onChange={(e) => onBillDiscountChange(Number(e.target.value), billDiscountIsPercent)}
              />
              <Select
                value={billDiscountIsPercent ? "percent" : "amount"}
                onValueChange={(v) => onBillDiscountChange(billDiscountValue, v === "percent")}
              >
                <SelectTrigger className="h-8 w-14">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="amount">₹</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs">
            Payment mode
            <kbd className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] font-normal text-muted-foreground">
              F4
            </kbd>
          </Label>
            <div className="flex gap-1">
              {PAYMENT_MODES.map((m) => {
                const disabled = m.value === "credit" && !creditEligible;
                return (
                  <Button
                    key={m.value}
                    type="button"
                    size="sm"
                    variant={paymentMode === m.value ? "default" : "outline"}
                    disabled={disabled}
                    onClick={() => onPaymentModeChange(m.value)}
                    title={disabled ? "Select a customer with a credit account first" : undefined}
                  >
                    {m.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="col-span-4 space-y-1">
            <Label className="text-xs">Coupon code</Label>
            {appliedCoupon ? (
              <div className="flex h-8 items-center justify-between rounded-md border bg-success/10 px-2 text-xs">
                <span className="flex items-center gap-1 text-success">
                  <Tag className="h-3 w-3" /> {appliedCoupon.code} applied
                </span>
                <button type="button" onClick={onRemoveCoupon} aria-label="Remove coupon">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <Input
                  className="h-8 uppercase"
                  placeholder="Enter code"
                  value={couponInput}
                  onChange={(e) => onCouponInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onApplyCoupon();
                    }
                  }}
                />
                <Button type="button" size="sm" className="h-8" onClick={onApplyCoupon} disabled={couponChecking}>
                  Apply
                </Button>
              </div>
            )}
            {couponError && <p className="text-[11px] text-destructive">{couponError}</p>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right text-xs text-muted-foreground">
            <div>
              Subtotal <span className="tabular-nums">₹{billing.subtotal.toFixed(2)}</span>
            </div>
            <div>
              Discount{" "}
              <span className="tabular-nums text-success">
                −₹{billing.discountAmount.toFixed(2)}
              </span>
            </div>
            {loyaltyDiscount && loyaltyDiscount.amount > 0 && (
              <div>
                &nbsp;&nbsp;· Loyalty{" "}
                <span className="tabular-nums text-success">−₹{loyaltyDiscount.amount.toFixed(2)}</span>
              </div>
            )}
            {couponDiscount && couponDiscount.amount > 0 && (
              <div>
                &nbsp;&nbsp;· Coupon{" "}
                <span className="tabular-nums text-success">−₹{couponDiscount.amount.toFixed(2)}</span>
              </div>
            )}
            <div>
              Tax (CGST+SGST) <span className="tabular-nums">₹{billing.taxAmount.toFixed(2)}</span>
            </div>
            {/* Shown at the till too, so the cashier can see why the amount
                to collect differs from subtotal + tax. */}
            {billing.roundOff !== 0 && (
              <div>
                Round off{" "}
                <span className="tabular-nums">
                  {billing.roundOff < 0 ? "−" : "+"}₹{Math.abs(billing.roundOff).toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold tabular-nums">₹{billing.total.toFixed(2)}</div>
          </div>
          {creditHeadroom !== null && creditHeadroom !== undefined && (
            <div
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs",
                billing.total > creditHeadroom
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {billing.total > creditHeadroom ? (
                <>
                  Over credit limit by ₹{(billing.total - creditHeadroom).toFixed(2)}
                  <div className="text-[10px]">Manager PIN needed</div>
                </>
              ) : (
                <>
                  Credit left
                  <div className="font-medium tabular-nums">₹{creditHeadroom.toFixed(2)}</div>
                </>
              )}
            </div>
          )}
          {holdControls}
          <Button
            size="lg"
            className="h-14 px-6"
            onClick={onCompleteSale}
            disabled={submitting || !!blockedReason}
            title={blockedReason ?? undefined}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Complete sale
            <kbd className="ml-2 hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] sm:inline">
              F9
            </kbd>
          </Button>
        </div>
      </div>
      {blockedReason && (
        <div className={cn("border-t px-4 py-1.5 text-xs text-destructive")}>{blockedReason}</div>
      )}

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuickAddCustomer()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                type="tel"
                inputMode="tel"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuickAddCustomer()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Credit limits and loyalty tiers are set on the Customers screen.
            </p>
            <Button
              disabled={savingCustomer || !newCustomerName.trim()}
              onClick={submitQuickAddCustomer}
            >
              Add customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
