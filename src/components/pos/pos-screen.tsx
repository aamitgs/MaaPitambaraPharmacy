"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { UserRole } from "@/generated/prisma/client";
import { useCartStore } from "@/store/cart-store";
import { computeBilling, effectiveDiscountPercent, type BillingLineInput, type StackedDiscountInput } from "@/lib/billing";
import { applySchemes } from "@/lib/scheme-engine";
import { completeSale, getPosData, verifyManagerPin, verifyPharmacistCredentials } from "@/lib/actions/pos";
import { validateCoupon } from "@/lib/actions/coupons";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { saveCache, loadCache, queueSale, listPendingSales, discardSale, newOfflineClientId, updateSaleStatus } from "@/lib/offline/queue";
import { syncPendingSales, SIGNOFF_REQUIRED_MESSAGE } from "@/lib/offline/sync";
import { buildOfflineReceiptData } from "@/lib/offline/receipt";
import type { PendingSale, ReceiptHeader, PosCacheRecord } from "@/lib/offline/db";
import type { ReceiptData } from "@/lib/actions/invoices";
import { OfflineBanner } from "./offline-banner";
import { OfflineReceiptOverlay } from "./offline-receipt-overlay";
import { SearchPanel } from "./search-panel";
import { CartTable } from "./cart-table";
import { BottomBar } from "./bottom-bar";
import { looseUnitRate } from "@/lib/loose-stock";
import { isBatchExpired } from "@/lib/expiry";
import { rateFor } from "@/lib/pricing";
import type { PaymentMode } from "@/generated/prisma/client";
import { HeldSales } from "./held-sales";
import { PrescriptionFields } from "./prescription-fields";
import { PrescriptionUpload } from "./prescription-upload";
import { ManagerPinDialog } from "./manager-pin-dialog";
import { PharmacistSignoffDialog } from "./pharmacist-signoff-dialog";
import type { PosItem, PosCustomer, PosDoctor, PosScheme } from "./types";

const SELF_SIGNOFF_ROLES = new Set(["pharmacist", "owner"]);

const REQUIRES_PRESCRIPTION = new Set(["H", "H1", "X"]);

type PendingDiscount =
  | { kind: "line"; lineId: string; percent: number }
  | { kind: "bill"; value: number; isPercent: boolean };

export function PosScreen({
  items,
  customers,
  doctors,
  branchId,
  staffDiscountCapPercent,
  offlineSyncMaxHours,
  wholesaleBillingEnabled,
  role,
  schemes,
  tenantId,
  receiptHeader,
}: {
  items: PosItem[];
  customers: PosCustomer[];
  doctors: PosDoctor[];
  branchId: string | null;
  staffDiscountCapPercent: number;
  /// From the pharmacy's settings — how long a queued sale may wait before
  /// it needs a human decision instead of posting itself.
  offlineSyncMaxHours: number;
  /** Off for a retail-only pharmacy, and then no PTR control appears. */
  wholesaleBillingEnabled: boolean;
  role: UserRole;
  schemes: PosScheme[];
  tenantId: string;
  receiptHeader: ReceiptHeader;
}) {
  const router = useRouter();
  const store = useCartStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [doctorList, setDoctorList] = useState(doctors);
  const [customerList, setCustomerList] = useState(customers);
  const [submitting, setSubmitting] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [pinDialog, setPinDialog] = useState<{
    open: boolean;
    pending: PendingDiscount | null;
    error: string | null;
    forFinalSubmit: boolean;
  }>({ open: false, pending: null, error: null, forFinalSubmit: false });
  const pinVerifiedRef = useRef(false);
  const managerPinRef = useRef<string | undefined>(undefined);
  const [signoffDialog, setSignoffDialog] = useState<{
    open: boolean;
    error: string | null;
    submitting: boolean;
  }>({ open: false, error: null, submitting: false });
  const pharmacistReauthRef = useRef<{ email: string; password: string } | undefined>(undefined);
  // Set when the signoff dialog is verifying a *queued* offline sale rather
  // than the live cart — completeSale re-runs directly against that sale's
  // stored payload instead of the current cart on success.
  const [queueSignoffTarget, setQueueSignoffTarget] = useState<string | null>(null);

  const isOnline = useOnlineStatus();
  /**
   * The snapshot this device last took while online.
   *
   * Only consulted when the page itself was served from the offline cache:
   * in that case the props above came out of a copy of the HTML that may be
   * hours old, whereas the snapshot is refreshed every few minutes for as
   * long as the till has a connection. When we loaded online, the props are
   * live and the snapshot is ignored.
   */
  const [restored, setRestored] = useState<PosCacheRecord | null>(null);
  useEffect(() => {
    // navigator.onLine, not the polled status: this asks "was this page
    // loaded during an outage", which has to be answered before the first
    // ping completes.
    if (typeof navigator !== "undefined" && navigator.onLine) return;
    let cancelled = false;
    void (async () => {
      const snapshot = await loadCache();
      if (!cancelled && snapshot && snapshot.tenantId === tenantId) {
        setRestored(snapshot);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [offlineReceipt, setOfflineReceipt] = useState<ReceiptData | null>(null);
  const wasOnline = useRef(isOnline);

  const refreshPendingSales = useCallback(async () => {
    setPendingSales(await listPendingSales(tenantId));
  }, [tenantId]);

  const handleSync = useCallback(
    async (force?: string[]) => {
      setSyncing(true);
      try {
        const summary = await syncPendingSales(tenantId, {
          maxAgeHours: offlineSyncMaxHours,
          force,
        });
        await refreshPendingSales();
        if (summary.synced > 0) toast.success(`${summary.synced} offline bill${summary.synced === 1 ? "" : "s"} synced`);
        if (summary.conflicts > 0) toast.error(`${summary.conflicts} offline bill${summary.conflicts === 1 ? "" : "s"} need review — stock changed while offline`);
        if (summary.failed > 0) toast.error(`${summary.failed} offline bill${summary.failed === 1 ? "" : "s"} failed to sync — will retry`);
        if (summary.needsSignoff > 0)
          toast.error(
            `${summary.needsSignoff} offline bill${summary.needsSignoff === 1 ? "" : "s"} need${summary.needsSignoff === 1 ? "s" : ""} a pharmacist to verify and sign off — open the queue`
          );
        if (summary.stale > 0)
          toast.warning(
            `${summary.stale} bill${summary.stale === 1 ? " has" : "s have"} been queued too long to post automatically — open the queue to review`
          );
      } finally {
        setSyncing(false);
      }
    },
    [tenantId, refreshPendingSales, offlineSyncMaxHours]
  );

  // Cache what this session needs to keep billing (and printing) working
  // offline. Writing this doesn't touch the live items/customers state
  // rendered on screen — it's purely a background snapshot for the
  // offline fallback path, so it can't destabilize the normal online flow.
  useEffect(() => {
    // Only ever snapshot data that came fresh from the server. Offline, these
    // props are whatever was baked into the cached copy of this page, and
    // writing them back would age the snapshot instead of preserving it.
    if (!isOnline) return;
    void saveCache({ tenantId, branchId, items, customers: customerList, doctors: doctorList, schemes, staffDiscountCapPercent, receiptHeader });
  }, [isOnline, tenantId, branchId, items, customerList, doctorList, schemes, staffDiscountCapPercent, receiptHeader]);

  // Keep the offline cache from going stale over a long shift, without
  // touching the live rendered item list — a long-open POS tab should
  // still have a reasonably fresh fallback if the network drops hours
  // after page load.
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      try {
        const fresh = await getPosData();
        await saveCache({
          tenantId,
          branchId: fresh.branchId,
          items: fresh.items,
          customers: fresh.customers,
          doctors: fresh.doctors,
          schemes: fresh.schemes,
          staffDiscountCapPercent: fresh.staffDiscountCapPercent,
          receiptHeader: fresh.receiptHeader,
        });
      } catch {
        // Best-effort background refresh — a failed attempt just means the
        // existing cache stays as-is until the next interval.
      }
    }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isOnline, tenantId, branchId]);

  // Load the queue on mount (so the banner shows the right count even if
  // offline from the very start), then sync if already online — and again
  // whenever connectivity transitions back on.
  const hasMounted = useRef(false);
  useEffect(() => {
    async function run() {
      if (isOnline && (!hasMounted.current || !wasOnline.current)) {
        await handleSync();
      } else {
        await refreshPendingSales();
      }
      hasMounted.current = true;
      wasOnline.current = isOnline;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  async function handleDiscardQueued(localId: string) {
    const sale = pendingSales.find((s) => s.localId === localId);
    if (sale?.status === "needs_signoff") {
      // This medicine has already left the shelf — discarding here means
      // no invoice and no narcotics register entry ever gets written for
      // it, not just that a pending sync goes away.
      const confirmed = window.confirm(
        "This sale hasn't been signed off or posted yet. Discarding it permanently drops the sale " +
          "and, if it contains a Schedule H/H1/X item, the narcotics register entry for medicine " +
          "that has already been handed to the customer. Only discard if you're certain it should " +
          "never be recorded. Continue?"
      );
      if (!confirmed) return;
    }
    await discardSale(localId);
    await refreshPendingSales();
  }

  function handleOpenQueuedSignoff(localId: string) {
    setQueueSignoffTarget(localId);
    setSignoffDialog({ open: true, error: null, submitting: false });
  }

  async function handleQueuedSignoffSubmit(localId: string, email: string, password: string) {
    const sale = pendingSales.find((s) => s.localId === localId);
    if (!sale) {
      setQueueSignoffTarget(null);
      setSignoffDialog({ open: false, error: null, submitting: false });
      return;
    }
    setSignoffDialog((d) => ({ ...d, submitting: true, error: null }));
    try {
      const result = await completeSale({
        ...sale.payload,
        pharmacistReauth: { email, password },
        queuedAt: new Date(sale.createdAt),
      });
      await updateSaleStatus(localId, "synced", { invoiceNo: result.invoiceNo });
      await refreshPendingSales();
      setQueueSignoffTarget(null);
      setSignoffDialog({ open: false, error: null, submitting: false });
      toast.success(`Offline bill synced — ${result.invoiceNo}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not verify sign-off";
      setSignoffDialog({
        open: true,
        submitting: false,
        error: message === SIGNOFF_REQUIRED_MESSAGE ? "Incorrect pharmacist email or password." : message,
      });
    }
  }

  const effectiveItems = restored?.items ?? items;
  const effectiveSchemes = restored?.schemes ?? schemes;
  const effectiveReceiptHeader = restored?.receiptHeader ?? receiptHeader;
  const effectiveDiscountCap = restored?.staffDiscountCapPercent ?? staffDiscountCapPercent;

  const catalogByItemId = useMemo(
    () => new Map(effectiveItems.map((i) => [i.id, i])),
    [effectiveItems]
  );

  const selectedCustomer = customerList.find((c) => c.id === store.customerId) ?? null;

  // Live "why" preview only — completeSale re-evaluates schemes and the
  // coupon server-side and never trusts these client-computed amounts.
  const schemeApplications = useMemo(
    () =>
      applySchemes(
        effectiveSchemes,
        store.lines.map((l) => ({ lineId: l.lineId, itemId: l.itemId, qty: l.qty, rate: l.rate }))
      ),
    [effectiveSchemes, store.lines]
  );
  const schemeByLineId = useMemo(
    () => new Map(schemeApplications.map((a) => [a.lineId, a])),
    [schemeApplications]
  );

  const billing = useMemo(() => {
    const lineInputs: BillingLineInput[] = store.lines.map((l) => ({
      lineId: l.lineId,
      qty: l.qty,
      // Mirrors the server's recompute, so the till and the bill agree:
      // basis first, then the loose split.
      rate: (() => {
        const base = wholesaleBillingEnabled
          ? rateFor({ saleRate: l.rate, ptr: l.ptr }, l.priceBasis)
          : l.rate;
        return l.isLooseSale ? looseUnitRate(base, l.unitsPerPack) : base;
      })(),
      taxRate: l.taxRate,
      discountPercent: l.discountPercent,
      schemeDiscountAmount: schemeByLineId.get(l.lineId)?.discountAmount ?? 0,
    }));
    const billDiscounts: StackedDiscountInput[] = [
      { type: "bill", isPercent: store.billDiscount.isPercent, value: store.billDiscount.value },
    ];
    if (selectedCustomer?.loyaltyTierName) {
      billDiscounts.push({ type: "loyalty", isPercent: true, value: selectedCustomer.loyaltyDiscountPercent });
    }
    if (store.appliedCoupon) {
      billDiscounts.push({
        type: "coupon",
        isPercent: store.appliedCoupon.type === "percent",
        value: store.appliedCoupon.value,
      });
    }
    return computeBilling(lineInputs, billDiscounts);
  }, [
    store.lines,
    store.billDiscount,
    store.appliedCoupon,
    schemeByLineId,
    selectedCustomer,
    wholesaleBillingEnabled,
  ]);

  const needsPrescription = store.lines.some((l) => REQUIRES_PRESCRIPTION.has(l.scheduleClass));

  // With a single doctor on file there is nothing to choose, so pick them
  // as soon as a prescription item enters the cart rather than making the
  // counter open a list of one. Deliberately *not* done when several
  // doctors exist: the doctor is written onto the invoice and the
  // Schedule X register, so a guess would put a wrong name on a legal
  // record. Writes to the store, not just the Select, so the sale actually
  // carries the id.
  const setDoctor = store.setDoctor;
  useEffect(() => {
    if (!needsPrescription || store.doctorId || doctorList.length !== 1) return;
    setDoctor(doctorList[0].id);
  }, [needsPrescription, store.doctorId, doctorList, setDoctor]);

  /**
   * How much more this customer may owe. Null when there is no credit
   * account or no limit — the POS already has both the limit and a
   * ledger-summed balance, so this needs no extra round trip.
   */
  const creditHeadroom = useMemo(() => {
    if (!selectedCustomer || selectedCustomer.creditLimit === null) return null;
    return selectedCustomer.creditLimit - selectedCustomer.outstandingBalance;
  }, [selectedCustomer]);

  const blockedReason = useMemo(() => {
    if (store.lines.length === 0) return "Add at least one item to the cart.";
    // Mirrors the server's hard block, so the counter finds out while the
    // customer is still standing there rather than at the last click.
    const expiredLine = store.lines.find((l) => isBatchExpired(new Date(l.expiryDate)));
    if (expiredLine) {
      return `${expiredLine.itemName} batch ${expiredLine.batchNo} has expired — remove it from the cart.`;
    }
    if (needsPrescription) {
      // Name only what's actually missing — with a single doctor on file
      // the selection is made automatically, so a combined message would
      // tell the counter to pick a doctor that is already picked.
      const missing: string[] = [];
      if (!store.doctorId) missing.push("select a doctor");
      if (!store.patientName.trim()) missing.push("enter the patient name");
      if (missing.length > 0) {
        const clause = missing.join(" and ");
        return `${clause[0].toUpperCase()}${clause.slice(1)} for prescription items.`;
      }
    }
    if (store.paymentMode === "credit") {
      const customer = customerList.find((c) => c.id === store.customerId);
      if (!customer || customer.creditLimit === null) {
        return "Select a customer with a credit account for credit sales.";
      }
      // Going over the limit is deliberately NOT blocked here: the server
      // accepts a manager PIN for it, so blocking would hide an approval
      // the counter is entitled to seek. The bottom bar shows the shortfall
      // and says a PIN is needed.
    }
    if (!branchId) return "No branch configured for this pharmacy yet.";
    // Offline-specific blocks — anything that needs a real-time server
    // check (credit ledger validation, PIN/pharmacist verification) can't
    // be safely approved from a cached, possibly-stale local state.
    if (!isOnline) {
      if (store.paymentMode === "credit") {
        return "Credit sales need a live connection — switch payment mode or wait until back online.";
      }
      if (needsPrescription && !SELF_SIGNOFF_ROLES.has(role)) {
        return "Prescription sign-off needs a live connection for pharmacist verification.";
      }
    }
    return null;
  }, [store.lines, needsPrescription, store.doctorId, store.patientName, store.paymentMode, store.customerId, customerList, branchId, isOnline, role]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  function handleAddItem(item: PosItem) {
    const fefo = item.batches[0];
    if (!fefo) {
      toast.error(`${item.name} has no stock available.`);
      return;
    }
    store.addLine({
      itemId: item.id,
      itemName: item.name,
      genericName: item.genericName,
      manufacturer: item.manufacturer,
      scheduleClass: item.scheduleClass,
      taxRate: item.taxRate,
      batchId: fefo.id,
      batchNo: fefo.batchNo,
      expiryDate: fefo.expiryDate.toISOString(),
      availableQty: fefo.currentQty,
      rate: fefo.saleRate,
      unitsPerPack: item.unitsPerPack,
      looseUnits: fefo.looseUnits,
      ptr: fefo.ptr === null || fefo.ptr === undefined ? null : Number(fefo.ptr),
    });
  }

  function requestPinIfNeeded(pending: PendingDiscount, effectivePercent: number, apply: () => void) {
    if (role !== "counter_staff" || effectivePercent <= effectiveDiscountCap || pinVerifiedRef.current) {
      apply();
      return;
    }
    if (!isOnline) {
      toast.error("This discount needs manager PIN approval, which requires a live connection.");
      return;
    }
    setPinDialog({ open: true, pending, error: null, forFinalSubmit: false });
  }

  function handleLineDiscountChange(lineId: string, percent: number) {
    const clamped = Math.max(0, Math.min(100, percent));
    requestPinIfNeeded({ kind: "line", lineId, percent: clamped }, clamped, () =>
      store.setLineDiscount(lineId, clamped)
    );
  }

  function handleBillDiscountChange(value: number, isPercent: boolean) {
    const clamped = Math.max(0, value);
    const effective = effectiveDiscountPercent({ isPercent, value: clamped }, billing.subtotal);
    requestPinIfNeeded({ kind: "bill", value: clamped, isPercent }, effective, () =>
      store.setBillDiscount({ isPercent, value: clamped })
    );
  }

  async function handleApplyCoupon() {
    if (!couponInput.trim()) return;
    setCouponChecking(true);
    setCouponError(null);
    try {
      const result = await validateCoupon(couponInput.trim(), store.customerId);
      if (!result.valid || !result.coupon) {
        setCouponError(result.error ?? "Invalid coupon code.");
        return;
      }
      store.setAppliedCoupon(result.coupon);
      setCouponInput("");
    } finally {
      setCouponChecking(false);
    }
  }

  function handleRemoveCoupon() {
    store.setAppliedCoupon(null);
    setCouponError(null);
  }

  async function handlePinSubmit(pin: string) {
    const valid = await verifyManagerPin(pin);
    if (!valid) {
      setPinDialog((d) => ({ ...d, error: "Incorrect PIN. Try again." }));
      return;
    }
    pinVerifiedRef.current = true;
    managerPinRef.current = pin;

    if (pinDialog.forFinalSubmit) {
      setPinDialog({ open: false, pending: null, error: null, forFinalSubmit: false });
      void submitSale();
      return;
    }

    const pending = pinDialog.pending;
    if (pending?.kind === "line") {
      store.setLineDiscount(pending.lineId, pending.percent);
    } else if (pending?.kind === "bill") {
      store.setBillDiscount({ isPercent: pending.isPercent, value: pending.value });
    }
    setPinDialog({ open: false, pending: null, error: null, forFinalSubmit: false });
  }

  function handleRemove(lineId: string) {
    const line = store.lines.find((l) => l.lineId === lineId);
    store.removeLine(lineId);
    if (line) {
      toast(`Removed ${line.itemName}`, {
        action: { label: "Undo", onClick: () => store.undoRemove() },
        duration: 5000,
      });
    }
  }

  function handleOverrideBatch(lineId: string, batchId: string) {
    const line = store.lines.find((l) => l.lineId === lineId);
    if (!line) return;
    const item = catalogByItemId.get(line.itemId);
    const batch = item?.batches.find((b) => b.id === batchId);
    if (!batch) return;
    store.overrideBatch(lineId, {
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate.toISOString(),
      availableQty: batch.currentQty,
      rate: batch.saleRate,
    });
  }

  async function submitSale() {
    if (!branchId) return;

    // Going over a credit ceiling needs the same manager PIN the discount
    // cap does. Asked for here rather than letting the server refuse:
    // telling the counter "a manager PIN is needed" and giving them no way
    // to enter one is worse than not offering the sale at all.
    if (
      store.paymentMode === "credit" &&
      creditHeadroom !== null &&
      billing.total > creditHeadroom &&
      !managerPinRef.current
    ) {
      if (!isOnline) {
        toast.error("Going over a credit limit needs a live connection for PIN approval.");
        return;
      }
      setPinDialog({ open: true, pending: null, error: null, forFinalSubmit: true });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        branchId,
        customerId: store.customerId,
        doctorId: store.doctorId,
        patientName: store.patientName || undefined,
        patientAge: store.patientAge ? Number(store.patientAge) : undefined,
        patientPhone: store.patientPhone || undefined,
        patientAddress: store.patientAddress || undefined,
        paymentMode: store.paymentMode,
        billDiscount: store.billDiscount,
        couponCode: store.appliedCoupon?.code,
        managerPin: managerPinRef.current,
        prescriptionImagePath: store.prescriptionImagePath ?? undefined,
        pharmacistReauth: pharmacistReauthRef.current,
        lines: store.lines.map((l) => ({
          itemId: l.itemId,
          batchId: l.batchId,
          qty: l.qty,
          isLooseSale: l.isLooseSale,
          priceBasis: l.priceBasis,
          discountPercent: l.discountPercent,
        })),
      };

      if (!isOnline) {
        const localId = newOfflineClientId();
        const offlineInvoiceNo = `OFFLINE-${new Date().toISOString().slice(0, 10)}-${localId.slice(-6)}`;
        await queueSale({
          tenantId,
          localId,
          payload: { ...payload, offlineClientId: localId },
          itemCount: store.lines.length,
          total: billing.total,
        });
        await refreshPendingSales();

        const receiptData = buildOfflineReceiptData({
          localId,
          invoiceNo: offlineInvoiceNo,
          lines: store.lines,
          catalogByItemId,
          billing,
          paymentMode: store.paymentMode,
          customer: selectedCustomer,
          doctor: doctorList.find((d) => d.id === store.doctorId) ?? null,
          patientName: store.patientName,
          patientAge: store.patientAge,
          patientPhone: store.patientPhone,
          patientAddress: store.patientAddress,
          header: effectiveReceiptHeader,
        });

        toast.success("Saved offline — will sync when back online");
        store.reset();
        setOfflineReceipt(receiptData);
        return;
      }

      const result = await completeSale(payload);
      toast.success(`Sale completed — ${result.invoiceNo}`);
      store.reset();
      pinVerifiedRef.current = false;
      managerPinRef.current = undefined;
      pharmacistReauthRef.current = undefined;
      router.push(`/invoices/${result.invoiceId}/receipt`);
    } catch (e) {
      if (e instanceof Error && e.message === "MANAGER_PIN_REQUIRED") {
        setPinDialog({ open: true, pending: null, error: null, forFinalSubmit: true });
      } else if (e instanceof Error && e.message === SIGNOFF_REQUIRED_MESSAGE) {
        const retry = pharmacistReauthRef.current !== undefined;
        pharmacistReauthRef.current = undefined;
        setSignoffDialog({
          open: true,
          error: retry ? "Incorrect pharmacist email or password." : null,
          submitting: false,
        });
      } else {
        toast.error(e instanceof Error ? e.message : "Could not complete sale");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCompleteSale() {
    if (blockedReason || submitting) return;
    void submitSale();
  }

  async function handleSignoffSubmit(email: string, password: string) {
    if (queueSignoffTarget) {
      await handleQueuedSignoffSubmit(queueSignoffTarget, email, password);
      return;
    }
    setSignoffDialog((d) => ({ ...d, submitting: true, error: null }));
    const result = await verifyPharmacistCredentials(email, password);
    if (!result) {
      setSignoffDialog({ open: true, error: "Incorrect pharmacist email or password.", submitting: false });
      return;
    }
    pharmacistReauthRef.current = { email, password };
    setSignoffDialog({ open: false, error: null, submitting: false });
    void submitSale();
  }

  /**
   * Counter shortcuts.
   *
   * Function keys rather than Ctrl/Alt combinations: the till is used by
   * people whose hands are on a scanner and a cash drawer, and a barcode
   * scanner emits ordinary characters — a letter-based shortcut would fire
   * mid-scan. F-keys are also what every other Indian billing package uses,
   * so they are already in muscle memory.
   *
   * Escape is the exception, and it is scoped: it only clears the field the
   * cursor is in, never the cart.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never steal a key from a dialog — a manager typing a PIN must not
      // trigger a sale.
      if (document.querySelector("[role=dialog]")) return;

      switch (e.key) {
        case "F2":
          e.preventDefault();
          focusSearch();
          break;
        case "F4": {
          e.preventDefault();
          // Cycles in the order the buttons are shown, so the shortcut and
          // the screen agree.
          const modes: PaymentMode[] = ["cash", "upi", "card", "credit"];
          const next = modes[(modes.indexOf(store.paymentMode) + 1) % modes.length];
          store.setPaymentMode(next);
          break;
        }
        case "F9":
          e.preventDefault();
          handleCompleteSale();
          break;
        case "Escape":
          // Only when the cursor is in the item search — Escape anywhere
          // else means "close what I opened", which is not ours to handle.
          if (document.activeElement === searchInputRef.current) {
            e.preventDefault();
            searchInputRef.current?.blur();
          }
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedReason, submitting, store, focusSearch]);

  if (offlineReceipt) {
    return (
      <OfflineReceiptOverlay
        data={offlineReceipt}
        onNewSale={() => setOfflineReceipt(null)}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <OfflineBanner
        isOnline={isOnline}
        syncing={syncing}
        pendingSales={pendingSales}
        onRetrySync={() => void handleSync()}
        onDiscard={(localId) => void handleDiscardQueued(localId)}
        onPostAnyway={(localId) => void handleSync([localId])}
        onSignoff={handleOpenQueuedSignoff}
      />
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <SearchPanel items={effectiveItems} onSelect={handleAddItem} inputRef={searchInputRef} />

        {needsPrescription && (
          <div className="space-y-2">
            <PrescriptionFields
              doctors={doctorList}
              doctorId={store.doctorId}
              onDoctorChange={store.setDoctor}
              patientName={store.patientName}
              onPatientNameChange={store.setPatientName}
              patientAge={store.patientAge}
              onPatientAgeChange={store.setPatientAge}
              patientPhone={store.patientPhone}
              onPatientPhoneChange={store.setPatientPhone}
              patientAddress={store.patientAddress}
              onPatientAddressChange={store.setPatientAddress}
              onDoctorCreated={(d) => setDoctorList((prev) => [...prev, d])}
            />
            <div className="flex items-center justify-between rounded-lg border p-3">
              <PrescriptionUpload
                path={store.prescriptionImagePath}
                onPathChange={store.setPrescriptionImagePath}
              />
              <p className="text-xs text-muted-foreground">
                {SELF_SIGNOFF_ROLES.has(role)
                  ? "You will sign off this dispense."
                  : "A pharmacist will need to sign off before this sale completes."}
              </p>
            </div>
          </div>
        )}

        <CartTable
          lines={store.lines}
          catalogByItemId={catalogByItemId}
          focusLineId={store.focusLineId}
          onFocusHandled={store.clearFocusLine}
          onQtyChange={store.updateQty}
          onLooseChange={store.setLineLoose}
          onBasisChange={store.setLineBasis}
          wholesaleBillingEnabled={wholesaleBillingEnabled}
          onQtyEnter={focusSearch}
          onDiscountChange={handleLineDiscountChange}
          onOverrideBatch={handleOverrideBatch}
          onRemove={handleRemove}
          schemeByLineId={schemeByLineId}
        />
      </div>

      <BottomBar
        creditHeadroom={store.paymentMode === "credit" ? creditHeadroom : null}
        holdControls={
          <HeldSales
            cartIsEmpty={store.lines.length === 0}
            getSnapshot={store.snapshot}
            estimatedTotal={billing.total}
            itemCount={store.lines.length}
            suggestedLabel={
              store.patientName.trim() ||
              customerList.find((c) => c.id === store.customerId)?.name ||
              `${store.lines.length} item${store.lines.length === 1 ? "" : "s"}`
            }
            onHeld={() => store.reset()}
            onResume={(snapshot) => store.restore(snapshot)}
          />
        }
        billing={billing}
        billDiscountValue={store.billDiscount.value}
        billDiscountIsPercent={store.billDiscount.isPercent}
        onBillDiscountChange={handleBillDiscountChange}
        customers={customerList}
        onCustomerCreated={(c) => setCustomerList((prev) => [...prev, c])}
        customerId={store.customerId}
        onCustomerChange={store.setCustomer}
        paymentMode={store.paymentMode}
        onPaymentModeChange={store.setPaymentMode}
        onCompleteSale={handleCompleteSale}
        submitting={submitting}
        blockedReason={blockedReason}
        appliedCoupon={store.appliedCoupon}
        couponInput={couponInput}
        onCouponInputChange={setCouponInput}
        onApplyCoupon={() => void handleApplyCoupon()}
        onRemoveCoupon={handleRemoveCoupon}
        couponError={couponError}
        couponChecking={couponChecking}
      />

      <ManagerPinDialog
        open={pinDialog.open}
        onOpenChange={(open) => setPinDialog((d) => ({ ...d, open }))}
        onSubmit={handlePinSubmit}
        error={pinDialog.error}
        reason={
          // The same dialog now guards two different overrides, so it has
          // to say which one — "a discount above your limit" on a credit
          // overage would send staff hunting for a discount that isn't there.
          pinDialog.forFinalSubmit
            ? store.paymentMode === "credit" &&
              creditHeadroom !== null &&
              billing.total > creditHeadroom
              ? `This puts ${selectedCustomer?.name ?? "the customer"} ₹${(billing.total - creditHeadroom).toFixed(2)} over their credit limit. Enter the manager PIN to approve.`
              : "This sale includes a discount above your approval limit."
            : "This discount exceeds the staff limit. Enter the manager PIN to override."
        }
      />

      <PharmacistSignoffDialog
        open={signoffDialog.open}
        onOpenChange={(open) => {
          setSignoffDialog((d) => ({ ...d, open }));
          if (!open) setQueueSignoffTarget(null);
        }}
        onSubmit={handleSignoffSubmit}
        error={signoffDialog.error}
        submitting={signoffDialog.submitting}
      />
    </div>
  );
}
