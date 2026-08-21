"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, hasPermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import {
  computeBilling,
  effectiveDiscountPercent,
  type BillingLineInput,
  type StackedDiscountInput,
} from "@/lib/billing";
import { serializeItem, serializeBatch } from "@/lib/serialize";
import { resolveConcreteBranch } from "@/lib/branch-scope";
import { applySchemes } from "@/lib/scheme-engine";
import { listActiveSchemesForBilling } from "@/lib/actions/schemes";
import {
  sellPacks,
  sellLooseUnits,
  looseUnitRate,
  totalUnits,
  LooseStockError,
} from "@/lib/loose-stock";
import { getBranding } from "@/lib/branding";
import { validateCoupon } from "@/lib/actions/coupons";

import { runEinvoiceAttempt, runEwayBillAttemptForInvoice } from "@/lib/gsp/engine";
import { isBatchExpired } from "@/lib/expiry";
import { loadTaxContext } from "@/lib/actions/tax-slabs";
import { resolveTaxRate } from "@/lib/tax/resolve";
import { rateFor, effectiveBasis } from "@/lib/pricing";
import { computeCustomerOutstandingBalances } from "@/lib/actions/customers";
import { format } from "date-fns";

const REQUIRES_PRESCRIPTION: readonly string[] = ["H", "H1", "X"];

export async function getPosData() {
  const session = await requireSession();
  const tenantId = session.user.tenantId;

  // POS always bills against one concrete branch's stock — never "all
  // branches" (Owner's consolidated view is for reporting, not billing).
  const branchId = await resolveConcreteBranch(tenantId, session.user.role);

  const [items, customers, doctors, tenant, schemes, branch, branding] = await Promise.all([
    prisma.item.findMany({
      // The outer filter has to mirror the inner one, or an item whose only
      // stock is expired comes back with an empty batch list and shows in
      // the picker as a dead entry the counter can click but not sell.
      where: {
        tenantId,
        isActive: true,
        batches: {
          some: {
            branchId: branchId ?? undefined,
            currentQty: { gt: 0 },
            expiryDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        },
      },
      include: {
        batches: {
          where: {
            branchId: branchId ?? undefined,
            currentQty: { gt: 0 },
            // Expired stock never reaches the counter's picker. It still
            // exists in inventory — it has to, so it can be written off —
            // but it is not sellable, so offering it only invites the
            // mistake the block downstream then has to catch.
            expiryDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
          orderBy: { expiryDate: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({ where: { tenantId }, orderBy: { name: "asc" }, include: { loyaltyTier: true } }),
    prisma.doctor.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    listActiveSchemesForBilling(tenantId),
    branchId ? prisma.branch.findUnique({ where: { id: branchId } }) : null,
    getBranding(),
  ]);

  const balances = await computeCustomerOutstandingBalances(tenantId, customers.map((c) => c.id));

  // The rate sent to the counter is the resolved one, so the on-screen
  // total matches what completeSale will recompute. Overriding `taxRate`
  // here rather than adding a field means no client code had to change —
  // and no client code can accidentally keep using the stale column.
  const posTaxContext = await loadTaxContext(tenantId);
  const now = new Date();

  return {
    items: items.map((item) => ({
      ...serializeItem(item),
      taxRate: resolveTaxRate({
        itemSlabId: item.taxSlabId,
        hsnCode: item.hsnCode,
        legacyTaxRate: Number(item.taxRate),
        ...posTaxContext,
        asOf: now,
      }).rate,
      batches: item.batches.map(serializeBatch),
    })),
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
      outstandingBalance: balances.get(c.id) ?? 0,
      loyaltyTierName: c.loyaltyTier?.name ?? null,
      loyaltyDiscountPercent: c.loyaltyTier ? Number(c.loyaltyTier.discountPercent) : 0,
    })),
    doctors,
    branchId,
    tenantId,
    staffDiscountCapPercent: Number(tenant.staffDiscountCapPercent),
    offlineSyncMaxHours: tenant.offlineSyncMaxHours,
    // Both gates folded into one flag for the client: the till only ever
    // needs to know "can this person bill wholesale here", and folding it
    // server-side means the browser is never trusted to combine them.
    wholesaleBillingEnabled:
      tenant.wholesaleBillingEnabled && (await hasPermission("sales.wholesale")),
    role: session.user.role,
    schemes,
    // Everything an offline-queued sale's locally-rendered receipt needs —
    // cached client-side so printing never requires a server round-trip.
    receiptHeader: {
      tenant: {
        pharmacyName: branding.name,
        invoiceHeaderText: branding.invoice.headerText,
        invoiceFooterText: branding.invoice.footerText,
        invoiceTermsText: branding.invoice.termsText,
        logoHorizontal: branding.logo.horizontal,
        logoIcon: branding.logo.icon,
        showLogo: branding.invoice.showLogo,
        paperDefault: branding.invoice.paperDefault,
      },
      branch: branch
        ? {
            name: branch.name,
            licensedAddress: branch.licensedAddress,
            phone: branch.phone,
            landline: branch.landline,
            gstin: branch.gstin,
            drugLicenseRetailNo: branch.drugLicenseRetailNo,
            drugLicenseWholesaleNo: branch.drugLicenseWholesaleNo,
            fssaiNo: branch.fssaiNo,
            pharmacistName: branch.pharmacistName,
            pharmacistRegistrationNo: branch.pharmacistRegistrationNo,
          }
        : null,
    },
  };
}

export async function verifyManagerPin(pin: string) {
  const session = await requireSession();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  if (!tenant.managerPinHash) return false;
  return bcrypt.compare(pin, tenant.managerPinHash);
}

const SIGNOFF_ROLES: readonly UserRole[] = ["pharmacist", "owner"];

/**
 * Optimistic check used to unlock the "Complete sale" button in the
 * re-auth dialog — completeSale re-verifies these same credentials
 * server-side before it will actually write a sign-off, the same
 * belt-and-suspenders pattern checkDiscountCap uses for the manager PIN.
 */
export async function verifyPharmacistCredentials(email: string, password: string) {
  const session = await requireSession();
  const user = await prisma.user.findFirst({
    where: { tenantId: session.user.tenantId, email, role: { in: [...SIGNOFF_ROLES] } },
  });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? { userId: user.id, name: user.name } : null;
}

async function resolvePharmacistSignoff(
  tenantId: string,
  sessionUserId: string,
  sessionRole: UserRole,
  reauth: { email: string; password: string } | undefined
): Promise<string> {
  if (SIGNOFF_ROLES.includes(sessionRole)) return sessionUserId;

  if (!reauth) throw new Error("PHARMACIST_SIGNOFF_REQUIRED");
  const user = await prisma.user.findFirst({
    where: { tenantId, email: reauth.email, role: { in: [...SIGNOFF_ROLES] } },
  });
  if (!user || !(await bcrypt.compare(reauth.password, user.passwordHash))) {
    throw new Error("PHARMACIST_SIGNOFF_REQUIRED");
  }
  return user.id;
}

const quickDoctorSchema = z.object({
  name: z.string().trim().min(1),
  registrationNo: z.string().trim().optional(),
  clinicName: z.string().trim().optional(),
  phone: z.string().trim().max(20).optional(),
});

const quickCustomerSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().max(20).optional(),
});

/**
 * Add a customer without leaving the till. Deliberately only name + phone:
 * credit limits and loyalty tiers are set on the Customers screen, where the
 * consequences are visible — a counter shortcut shouldn't be able to open a
 * credit account mid-sale.
 */
export async function quickAddCustomer(input: z.infer<typeof quickCustomerSchema>) {
  const session = await requireSession();
  const parsed = quickCustomerSchema.parse(input);
  const customer = await prisma.customer.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      phone: parsed.phone || null,
    },
  });
  revalidatePath("/pos");
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    creditLimit: customer.creditLimit === null ? null : Number(customer.creditLimit),
    outstandingBalance: Number(customer.outstandingBalance),
    loyaltyTierName: null,
    loyaltyDiscountPercent: 0,
  };
}

export async function quickAddDoctor(input: z.infer<typeof quickDoctorSchema>) {
  const session = await requireSession();
  const parsed = quickDoctorSchema.parse(input);
  const doctor = await prisma.doctor.create({
    data: { ...parsed, tenantId: session.user.tenantId },
  });
  revalidatePath("/pos");
  return doctor;
}

const saleLineSchema = z.object({
  itemId: z.string().min(1),
  batchId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  /** When true, `qty` counts loose units rather than whole packs. */
  isLooseSale: z.boolean().default(false),
  /** Retail (MRP-derived) or wholesale (PTR). Ignored unless wholesale
   *  billing is switched on for the tenant. */
  priceBasis: z.enum(["mrp", "ptr"]).default("mrp"),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
});

const completeSaleSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  doctorId: z.string().optional().nullable(),
  patientName: z.string().trim().optional(),
  patientAge: z.coerce.number().int().positive().optional(),
  // Free-form: staff enter +91 prefixes, landlines and spacing however the
  // patient gives it. Length-capped rather than pattern-matched.
  patientPhone: z.string().trim().max(20).optional(),
  patientAddress: z.string().trim().max(300).optional(),
  paymentMode: z.enum(["cash", "upi", "card", "credit"]),
  billDiscount: z.object({
    isPercent: z.boolean(),
    value: z.coerce.number().min(0),
  }),
  couponCode: z.string().trim().optional(),
  managerPin: z.string().optional(),
  prescriptionImagePath: z.string().optional(),
  pharmacistReauth: z.object({ email: z.string().email(), password: z.string().min(1) }).optional(),
  // Set only when this sale was queued while offline and is now syncing —
  // lets a retried sync short-circuit to the already-created invoice
  // instead of double-billing if the client never saw the first response.
  offlineClientId: z.string().optional(),
  lines: z.array(saleLineSchema).min(1, "Cart is empty"),
});

export type CompleteSaleInput = z.infer<typeof completeSaleSchema>;


async function checkDiscountCap(
  tenantId: string,
  role: string,
  percent: number,
  managerPin: string | undefined
) {
  if (role !== "counter_staff") return;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const cap = Number(tenant.staffDiscountCapPercent);
  if (percent <= cap) return;
  if (!managerPin || !tenant.managerPinHash) {
    throw new Error("MANAGER_PIN_REQUIRED");
  }
  const valid = await bcrypt.compare(managerPin, tenant.managerPinHash);
  if (!valid) throw new Error("MANAGER_PIN_REQUIRED");
}

export async function completeSale(input: CompleteSaleInput) {
  const session = await requireSession();
  const tenantId = session.user.tenantId;
  const parsed = completeSaleSchema.parse(input);

  if (parsed.offlineClientId) {
    const existing = await prisma.salesInvoice.findFirst({
      where: { tenantId, offlineClientId: parsed.offlineClientId },
      select: { id: true, invoiceNo: true },
    });
    if (existing) return { invoiceId: existing.id, invoiceNo: existing.invoiceNo };
  }

  // The upload endpoint always writes under `<sessionTenantId>/<uuid>.<ext>`.
  // Reject anything else so a client can't attach another tenant's
  // prescription image path to an invoice on this tenant — the file-serving
  // route trusts whichever invoice references a path, so this is the only
  // place that ownership actually gets checked.
  if (parsed.prescriptionImagePath && !parsed.prescriptionImagePath.startsWith(`${tenantId}/`)) {
    throw new Error("Invalid prescription image reference.");
  }

  const branch = await prisma.branch.findFirst({ where: { id: parsed.branchId, tenantId } });
  if (!branch) throw new Error("Invalid branch.");

  const batchIds = parsed.lines.map((l) => l.batchId);
  const batches = await prisma.batch.findMany({
    // branchId scoped to the invoice's own branch — a batch physically at
    // another branch (even same tenant) must never be decremented by a
    // sale rung up elsewhere.
    where: { id: { in: batchIds }, branchId: parsed.branchId, item: { tenantId } },
    include: { item: true },
  });
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  for (const line of parsed.lines) {
    const batch = batchMap.get(line.batchId);
    if (!batch || batch.itemId !== line.itemId) {
      throw new Error("One of the items in the cart is no longer available.");
    }
    if (batch.currentQty < line.qty) {
      throw new Error(
        `Only ${batch.currentQty} unit(s) of ${batch.item.name} (batch ${batch.batchNo}) left in stock.`
      );
    }
    // Deliberately NOT overridable by a manager PIN, unlike the discount
    // cap. Selling past-expiry medicine is an offence under the Drugs and
    // Cosmetics Act, not a commercial judgement someone senior gets to
    // make. The way past this is a stock write-off, not an approval.
    // The picker already hides retired items, but a cart held from before
    // the item was retired, or a page open since then, would still submit
    // one. The picker is a convenience; this is the rule.
    if (!batch.item.isActive) {
      throw new Error(
        `${batch.item.name} has been retired and cannot be sold. Remove it from the cart.`
      );
    }
    if (isBatchExpired(batch.expiryDate)) {
      throw new Error(
        `${batch.item.name} batch ${batch.batchNo} expired ${format(batch.expiryDate, "MMM yyyy")} ` +
          `and cannot be sold. Remove it from the cart and write the batch off under Stock Adjustments.`
      );
    }
  }

  const needsPrescription = parsed.lines.some((l) =>
    REQUIRES_PRESCRIPTION.includes(batchMap.get(l.batchId)!.item.scheduleClass)
  );
  if (needsPrescription && (!parsed.doctorId || !parsed.patientName)) {
    throw new Error(
      "A doctor and patient name are required for prescription (Schedule H/H1/X) items."
    );
  }

  // A Pharmacist/Owner already at the till signs off via their own session;
  // Counter Staff must have a Pharmacist/Owner re-authenticate first.
  const signoffUserId = needsPrescription
    ? await resolvePharmacistSignoff(
        tenantId,
        session.user.id,
        session.user.role,
        parsed.pharmacistReauth
      )
    : null;

  const customer = parsed.customerId
    ? await prisma.customer.findFirst({
        where: { id: parsed.customerId, tenantId },
        include: { loyaltyTier: true },
      })
    : null;

  if (parsed.paymentMode === "credit") {
    if (!customer) {
      throw new Error("Select a customer with a credit limit for credit sales.");
    }
    if (customer.creditLimit === null) {
      throw new Error("Selected customer does not have a credit account.");
    }
  }

  // Schemes are re-fetched and re-evaluated server-side — the client's
  // "why" badges are a preview, never a trusted input.
  const activeSchemes = await listActiveSchemesForBilling(tenantId);
  const schemeApplications = applySchemes(
    activeSchemes,
    parsed.lines.map((l) => ({
      lineId: `${l.itemId}:${l.batchId}`,
      itemId: l.itemId,
      qty: l.qty,
      rate: Number(batchMap.get(l.batchId)!.saleRate),
    }))
  );
  const schemeByLineId = new Map(schemeApplications.map((a) => [a.lineId, a]));

  const couponResult = parsed.couponCode
    ? await validateCoupon(parsed.couponCode, parsed.customerId ?? null)
    : null;
  if (parsed.couponCode && (!couponResult || !couponResult.valid || !couponResult.coupon)) {
    throw new Error(couponResult?.error ?? "Invalid coupon code.");
  }
  const coupon = couponResult?.coupon ?? null;

  // Rates come from the slab master as of now, not from the item's stored
  // column. That column is the last fallback inside resolveTaxRate — an
  // item with no slab and no HSN mapping still bills exactly as it did
  // before slabs existed.
  // Read once here rather than threaded from the client: whether this
  // pharmacy does wholesale at all is not the browser's to assert.
  const { wholesaleBillingEnabled: tenantWholesaleOn } =
    await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { wholesaleBillingEnabled: true },
    });

  // Two separate gates, and both must pass. The tenant switch says the
  // pharmacy does wholesale at all; the permission says *this person* may
  // bill at it. PTR sits below retail by design, so without the second
  // gate anyone on the counter could hand margin to a friend.
  const mayBillWholesale = await hasPermission("sales.wholesale");
  const wantsWholesale = parsed.lines.some((l) => l.priceBasis === "ptr");

  if (wantsWholesale) {
    if (!tenantWholesaleOn) {
      throw new Error("Wholesale billing is switched off for this pharmacy.");
    }
    if (!mayBillWholesale) {
      throw new Error(
        "You are not allowed to bill at wholesale rates. Ask the owner, or have someone with that permission ring this sale up."
      );
    }
  }

  const wholesaleOn = tenantWholesaleOn && mayBillWholesale;
  const taxContext = await loadTaxContext(tenantId);
  const resolvedLineRates = new Map(
    parsed.lines.map((l) => {
      const batch = batchMap.get(l.batchId)!;
      const pricing = {
        saleRate: Number(batch.saleRate),
        ptr: batch.ptr === null ? null : Number(batch.ptr),
      };
      const base = wholesaleOn ? rateFor(pricing, l.priceBasis) : pricing.saleRate;
      return [
        l.batchId,
        {
          rate: l.isLooseSale ? looseUnitRate(base, batch.item.unitsPerPack) : base,
          basis: wholesaleOn ? effectiveBasis(pricing, l.priceBasis) : ("mrp" as const),
        },
      ];
    })
  );

  const resolvedRates = new Map(
    parsed.lines.map((l) => {
      const batch = batchMap.get(l.batchId)!;
      return [
        l.batchId,
        resolveTaxRate({
          itemSlabId: batch.item.taxSlabId,
          hsnCode: batch.item.hsnCode,
          legacyTaxRate: Number(batch.item.taxRate),
          ...taxContext,
          asOf: new Date(),
        }),
      ];
    })
  );

  const billingLines: BillingLineInput[] = parsed.lines.map((l) => {
    const batch = batchMap.get(l.batchId)!;
    const lineId = `${l.itemId}:${l.batchId}`;
    return {
      lineId,
      qty: l.qty,
      rate: resolvedLineRates.get(l.batchId)!.rate,
      taxRate: resolvedRates.get(l.batchId)!.rate,
      discountPercent: l.discountPercent,
      schemeDiscountAmount: schemeByLineId.get(lineId)?.discountAmount ?? 0,
    };
  });

  const billDiscounts: StackedDiscountInput[] = [
    { type: "bill", isPercent: parsed.billDiscount.isPercent, value: parsed.billDiscount.value },
  ];
  if (customer?.loyaltyTier) {
    billDiscounts.push({ type: "loyalty", isPercent: true, value: Number(customer.loyaltyTier.discountPercent) });
  }
  if (coupon) {
    billDiscounts.push({ type: "coupon", isPercent: coupon.type === "percent", value: coupon.value });
  }

  const billing = computeBilling(billingLines, billDiscounts);

  // The credit ceiling, checked here rather than up with the other credit
  // validation because it needs the bill total, which only exists now.
  //
  // Until this landed, `creditLimit` was checked for existence and never
  // as a limit — a customer with a 5,000 ceiling and 50,000 outstanding
  // could keep buying indefinitely. The balance is summed from the ledger,
  // never read from the cached column on Customer.
  if (parsed.paymentMode === "credit" && customer && customer.creditLimit !== null) {
    const balances = await computeCustomerOutstandingBalances(tenantId, [customer.id]);
    const outstanding = balances.get(customer.id) ?? 0;
    const limit = Number(customer.creditLimit);
    const afterThisSale = outstanding + billing.total;

    if (afterThisSale > limit) {
      // Overridable by a manager, unlike expiry: extending credit past a
      // ceiling is a commercial decision somebody senior is entitled to
      // make, and refusing outright would just push the sale off the books.
      const approved = parsed.managerPin
        ? await verifyManagerPin(parsed.managerPin)
        : false;
      if (!approved) {
        throw new Error(
          `${customer.name} would owe Rs ${afterThisSale.toFixed(2)} against a credit limit of ` +
            `Rs ${limit.toFixed(2)} (Rs ${outstanding.toFixed(2)} already outstanding). ` +
            `A manager PIN is needed to go over the limit, or take payment another way.`
        );
      }
      await writeAuditLog({
        tenantId,
        userId: session.user.id,
        action: "sale.creditLimitOverride",
        entity: "Customer",
        entityId: customer.id,
        before: { creditLimit: limit, outstanding },
        after: { saleTotal: billing.total, wouldOwe: afterThisSale },
      });
    }
  }

  // Discount-cap check, defense in depth (client already gates this).
  // Only the manual item/bill discounts are staff decisions subject to the
  // cap — scheme/loyalty/coupon discounts are system-applied, not entered
  // by staff, so they're excluded from the PIN-override check.
  for (let i = 0; i < parsed.lines.length; i++) {
    await checkDiscountCap(
      tenantId,
      session.user.role,
      parsed.lines[i].discountPercent,
      parsed.managerPin
    );
  }
  const billDiscountPercent = effectiveDiscountPercent(parsed.billDiscount, billing.subtotal);
  await checkDiscountCap(tenantId, session.user.role, billDiscountPercent, parsed.managerPin);

  const now = new Date();
  const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const result = await prisma.$transaction(async (tx) => {
    const countThisMonth = await tx.salesInvoice.count({
      where: { tenantId, invoiceNo: { startsWith: `INV-${monthKey}-` } },
    });
    const invoiceNo = `INV-${monthKey}-${String(countThisMonth + 1).padStart(4, "0")}`;

    const invoice = await tx.salesInvoice.create({
      data: {
        tenantId,
        branchId: parsed.branchId,
        customerId: parsed.customerId || null,
        doctorId: parsed.doctorId || null,
        patientName: parsed.patientName || null,
        patientAge: parsed.patientAge ?? null,
        patientPhone: parsed.patientPhone || null,
        patientAddress: parsed.patientAddress || null,
        invoiceNo,
        offlineClientId: parsed.offlineClientId || null,
        subtotal: billing.subtotal,
        taxAmount: billing.taxAmount,
        discountAmount: billing.discountAmount,
        total: billing.total,
        roundOffAmount: billing.roundOff,
        paymentMode: parsed.paymentMode,
        status: "completed",
        prescriptionImageUrl: parsed.prescriptionImagePath || null,
        pharmacistSignoffUserId: signoffUserId,
        pharmacistSignoffAt: signoffUserId ? now : null,
      },
    });

    for (let i = 0; i < parsed.lines.length; i++) {
      const line = parsed.lines[i];
      const lineBilling = billing.lines[i];
      const batch = batchMap.get(line.batchId)!;

      const invoiceItem = await tx.salesInvoiceItem.create({
        data: {
          invoiceId: invoice.id,
          itemId: line.itemId,
          batchId: line.batchId,
          qty: line.qty,
          isLooseSale: line.isLooseSale,
          // What was actually applied, which differs from what was asked
          // for when a batch has no PTR.
          priceBasis: resolvedLineRates.get(line.batchId)!.basis,
          // Snapshot, so changing an item's pack size later cannot rewrite
          // what a past bill meant by "4".
          unitsPerPack: batch.item.unitsPerPack,
          // The rate stored is the rate charged — the same value the totals
          // were computed from, not a second derivation of it. Reading it
          // from one map is what stops a bill printing 28.00 beside a
          // 21.50 charge.
          rate: resolvedLineRates.get(line.batchId)!.rate,
          // Stored, not referenced: this is what makes a past invoice immune
          // to a later rate change.
          taxRate: resolvedRates.get(line.batchId)!.rate,
          discountAmount:
            lineBilling.itemDiscountAmount + lineBilling.schemeDiscountAmount + lineBilling.billDiscountShare,
        },
      });

      if (line.discountPercent > 0) {
        await tx.discount.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            invoiceItemId: invoiceItem.id,
            type: "item",
            amountOrPercent: line.discountPercent,
            isPercent: true,
            amount: lineBilling.itemDiscountAmount,
            appliedByUserId: session.user.id,
          },
        });
      }

      const schemeApplied = schemeByLineId.get(`${line.itemId}:${line.batchId}`);
      if (schemeApplied && lineBilling.schemeDiscountAmount > 0) {
        await tx.discount.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            invoiceItemId: invoiceItem.id,
            type: "scheme",
            schemeId: schemeApplied.schemeId,
            amountOrPercent: lineBilling.schemeDiscountAmount,
            isPercent: false,
            amount: lineBilling.schemeDiscountAmount,
            appliedByUserId: session.user.id,
          },
        });
      }

      if (line.isLooseSale) {
        // Opening a pack cannot be written as one conditional decrement, so
        // the row is re-read inside the transaction and written back with a
        // compare-and-set on both columns. Same optimistic guarantee as the
        // pack path: if anything moved in between, the update matches zero
        // rows and the sale is rejected rather than overselling.
        const fresh = await tx.batch.findUniqueOrThrow({
          where: { id: line.batchId },
          select: { currentQty: true, looseUnits: true },
        });
        let next;
        try {
          next = sellLooseUnits(
            { packs: fresh.currentQty, looseUnits: fresh.looseUnits },
            line.qty,
            {
              unitsPerPack: batch.item.unitsPerPack,
              allowLooseSale: batch.item.allowLooseSale,
            }
          );
        } catch (e) {
          throw new Error(
            e instanceof LooseStockError
              ? `${batch.item.name} (batch ${batch.batchNo}): ${e.message}`
              : String(e)
          );
        }
        const updateResult = await tx.batch.updateMany({
          where: {
            id: line.batchId,
            currentQty: fresh.currentQty,
            looseUnits: fresh.looseUnits,
          },
          data: { currentQty: next.packs, looseUnits: next.looseUnits },
        });
        if (updateResult.count === 0) {
          throw new Error(
            `Stock for ${batch.item.name} (batch ${batch.batchNo}) changed — please review the cart and try again.`
          );
        }
      } else {
        const updateResult = await tx.batch.updateMany({
          where: { id: line.batchId, currentQty: { gte: line.qty } },
          data: { currentQty: { decrement: line.qty } },
        });
        if (updateResult.count === 0) {
          throw new Error(
            `Stock for ${batch.item.name} (batch ${batch.batchNo}) changed — please review the cart and try again.`
          );
        }
      }

      if (batch.item.scheduleClass === "X") {
        await tx.narcoticRegisterEntry.create({
          data: {
            tenantId,
            branchId: parsed.branchId,
            invoiceId: invoice.id,
            itemId: line.itemId,
            batchId: line.batchId,
            qty: line.qty,
            doctorId: parsed.doctorId || null,
            patientName: parsed.patientName || null,
            // Schedule X is in REQUIRES_PRESCRIPTION, so needsPrescription
            // is true whenever this branch runs and signoffUserId is
            // already resolved — the pharmacist who signed off the
            // dispense, not necessarily whoever rang up the sale.
            dispensedByUserId: signoffUserId!,
          },
        });
      }
    }

    if (parsed.billDiscount.value > 0) {
      await tx.discount.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          type: "bill",
          amountOrPercent: parsed.billDiscount.value,
          isPercent: parsed.billDiscount.isPercent,
          amount: billing.billDiscounts.find((d) => d.type === "bill")?.amount ?? 0,
          appliedByUserId: session.user.id,
        },
      });
    }

    if (customer?.loyaltyTier) {
      await tx.discount.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          type: "loyalty",
          amountOrPercent: customer.loyaltyTier.discountPercent,
          isPercent: true,
          amount: billing.billDiscounts.find((d) => d.type === "loyalty")?.amount ?? 0,
          appliedByUserId: session.user.id,
        },
      });
    }

    if (coupon) {
      // Re-checked inside the transaction against concurrent use — the
      // pre-transaction validateCoupon call is only an optimistic check.
      const fresh = await tx.coupon.findUnique({ where: { id: coupon.id } });
      if (!fresh) throw new Error("Coupon is no longer available.");
      if (fresh.usageLimit !== null && fresh.usageCount >= fresh.usageLimit) {
        throw new Error("Coupon usage limit reached — remove it and try again.");
      }
      if (fresh.singleUsePerCustomer && parsed.customerId) {
        const alreadyUsed = await tx.discount.findFirst({
          where: { couponId: coupon.id, invoice: { customerId: parsed.customerId } },
        });
        if (alreadyUsed) throw new Error("This customer has already used this coupon.");
      }
      const couponUpdate = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          ...(fresh.usageLimit !== null ? { usageCount: { lt: fresh.usageLimit } } : {}),
        },
        data: { usageCount: { increment: 1 } },
      });
      if (couponUpdate.count === 0) {
        throw new Error("Coupon usage limit reached — remove it and try again.");
      }
      await tx.discount.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          type: "coupon",
          couponId: coupon.id,
          amountOrPercent: coupon.value,
          isPercent: coupon.type === "percent",
          amount: billing.billDiscounts.find((d) => d.type === "coupon")?.amount ?? 0,
          appliedByUserId: session.user.id,
        },
      });
    }

    if (parsed.customerId) {
      const updated = await tx.customer.update({
        where: { id: parsed.customerId },
        data: { cumulativeSpend: { increment: billing.total } },
      });

      if (parsed.paymentMode === "credit") {
        // Due date copied from the customer's term as it stands now, not
        // referenced — changing the term later must not silently re-age
        // charges that were already agreed on the old one.
        const dueDate =
          customer?.creditTermDays != null
            ? new Date(Date.now() + customer.creditTermDays * 86_400_000)
            : null;

        await tx.customerLedgerEntry.create({
          data: {
            tenantId,
            customerId: parsed.customerId,
            type: "sale",
            amount: billing.total,
            dueDate,
            referenceId: invoice.id,
            referenceType: "SalesInvoice",
          },
        });
      }

      const tiers = await tx.loyaltyTier.findMany({
        where: { tenantId },
        orderBy: { minCumulativeSpend: "desc" },
      });
      const newSpend = Number(updated.cumulativeSpend);
      const newTier = tiers.find((t) => Number(t.minCumulativeSpend) <= newSpend) ?? null;
      if ((newTier?.id ?? null) !== updated.loyaltyTierId) {
        await tx.customer.update({
          where: { id: parsed.customerId },
          data: { loyaltyTierId: newTier?.id ?? null },
        });
      }
    }

    return invoice;
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "sale.complete",
    entity: "SalesInvoice",
    entityId: result.id,
    after: { invoiceNo: result.invoiceNo, total: billing.total },
  });

  revalidatePath("/items");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/customers");

  // Fire-and-forget: the counter transaction (sale saved, ready to print)
  // is already complete and its response about to return. A slow or down
  // GSP must never add latency here — this keeps running on the same
  // long-lived Node process after the response is sent, and any failure is
  // swallowed (retryable later from the receipt screen), never surfaced as
  // a checkout error.
  void runEinvoiceAttempt(result.id).catch(() => {});
  void runEwayBillAttemptForInvoice(result.id).catch(() => {});

  return { invoiceId: result.id, invoiceNo: result.invoiceNo };
}
