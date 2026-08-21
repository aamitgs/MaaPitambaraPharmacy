"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { contrastRatio, isHex, normalizeHex } from "@/lib/color";
import { BRAND } from "@/lib/brand";
import { BRAND_ACCENT } from "@/lib/branding";

/**
 * White-label branding. Owner-only at every entry point, and audit-logged
 * with before/after — but deliberately NOT behind the password + OTP
 * step-up that guards Staff & roles. Nothing here grants access or moves
 * money, and it is all reversible; asking for an authenticator code to
 * change a colour would train people to type codes reflexively, which is
 * exactly what weakens the step-up where it matters.
 */
const ownerOnly = () => requireRole(["owner"]);

const hex = z
  .string()
  .trim()
  .refine(isHex, "Use a 6-digit hex colour like #6E1B3A")
  .transform(normalizeHex);

const identitySchema = z.object({
  pharmacyName: z.string().trim().min(1, "The pharmacy needs a name").max(120),
  brandShortName: z.string().trim().max(24),
  brandTagline: z.string().trim().max(160),
  brandDescription: z.string().trim().max(400),
});

const colorsSchema = z.object({
  primaryColor: hex,
  accentColor: hex,
  surfaceColor: hex,
});

const invoiceSchema = z.object({
  invoiceHeaderText: z.string().trim().max(300),
  invoiceFooterText: z.string().trim().max(1000),
  invoiceTermsText: z.string().trim().max(1000),
  invoicePaperDefault: z.enum(["58mm", "80mm", "a5", "a4"]),
  showLogoOnInvoice: z.boolean(),
  upiId: z
    .string()
    .trim()
    .max(80)
    .refine(
      (v) => v === "" || /^[\w.\-]{2,}@[a-z]{2,}$/i.test(v),
      "A UPI ID looks like name@bank — this one won't scan"
    ),
});

const contactSchema = z.object({
  supportEmail: z.string().trim().max(160),
  websiteUrl: z.string().trim().max(200),
  hoursHeadline: z.string().trim().max(60),
  hoursNote: z.string().trim().max(200),
});

const logosSchema = z.object({
  logoIconUrl: z.string().trim().nullable(),
  logoHorizontalUrl: z.string().trim().nullable(),
  logoStackedUrl: z.string().trim().nullable(),
});

const brandingSchema = identitySchema
  .merge(colorsSchema)
  .merge(invoiceSchema)
  .merge(contactSchema)
  .merge(logosSchema);

export type BrandingInput = z.infer<typeof brandingSchema>;

/**
 * Two pairs are checked, and only against the surfaces they are actually
 * drawn on — measuring the wrong pair is how a validator ends up rejecting
 * a perfectly good brand.
 *
 *   primary on surface  headings, totals, the invoice heading. Real body
 *                       text on paper, so WCAG AA 4.5:1, enforced.
 *   accent on primary   the large figure on the Counter hours card, which
 *                       is the only text ever drawn in the accent. Large
 *                       text, so 3:1, enforced.
 *
 * Accent-on-surface is deliberately NOT gated: there the accent only ever
 * carries icons and hairlines, never text, and gating it would refuse this
 * pharmacy's own gold (2.6:1 on cream) — a colour off their printed brand
 * sheet. The form shows that ratio as advice instead.
 */
const MIN_BODY_CONTRAST = 4.5;
const MIN_LARGE_CONTRAST = 3;

export async function updateBranding(input: BrandingInput) {
  const session = await ownerOnly();
  const parsed = brandingSchema.parse(input);

  const onSurface = contrastRatio(parsed.primaryColor, parsed.surfaceColor);
  if (onSurface !== null && onSurface < MIN_BODY_CONTRAST) {
    throw new Error(
      `That primary colour only reaches ${onSurface.toFixed(1)}:1 against the background — ` +
        `it needs ${MIN_BODY_CONTRAST}:1 to stay readable on a printed bill. Try a darker shade.`
    );
  }
  const accentOnPrimary = contrastRatio(parsed.accentColor, parsed.primaryColor);
  if (accentOnPrimary !== null && accentOnPrimary < MIN_LARGE_CONTRAST) {
    throw new Error(
      `The accent only reaches ${accentOnPrimary.toFixed(1)}:1 against the primary colour — ` +
        `the counter-hours headline is drawn in it and would be hard to read. ` +
        `It needs at least ${MIN_LARGE_CONTRAST}:1.`
    );
  }

  const before = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.user.tenantId },
    select: {
      pharmacyName: true,
      primaryColor: true,
      accentColor: true,
      surfaceColor: true,
      upiId: true,
      logoIconUrl: true,
      logoHorizontalUrl: true,
      logoStackedUrl: true,
    },
  });

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      pharmacyName: parsed.pharmacyName,
      brandShortName: parsed.brandShortName || null,
      brandTagline: parsed.brandTagline || null,
      brandDescription: parsed.brandDescription || null,
      primaryColor: parsed.primaryColor,
      accentColor: parsed.accentColor,
      surfaceColor: parsed.surfaceColor,
      invoiceHeaderText: parsed.invoiceHeaderText || null,
      invoiceFooterText: parsed.invoiceFooterText || null,
      invoiceTermsText: parsed.invoiceTermsText || null,
      invoicePaperDefault: parsed.invoicePaperDefault,
      showLogoOnInvoice: parsed.showLogoOnInvoice,
      upiId: parsed.upiId || null,
      supportEmail: parsed.supportEmail || null,
      websiteUrl: parsed.websiteUrl || null,
      hoursHeadline: parsed.hoursHeadline || null,
      hoursNote: parsed.hoursNote || null,
      logoIconUrl: parsed.logoIconUrl,
      logoHorizontalUrl: parsed.logoHorizontalUrl,
      logoStackedUrl: parsed.logoStackedUrl,
      brandingUpdatedAt: new Date(),
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "branding.update",
    entity: "Tenant",
    entityId: session.user.tenantId,
    before,
    after: {
      pharmacyName: parsed.pharmacyName,
      primaryColor: parsed.primaryColor,
      accentColor: parsed.accentColor,
      surfaceColor: parsed.surfaceColor,
      upiId: parsed.upiId || null,
      logoIconUrl: parsed.logoIconUrl,
      logoHorizontalUrl: parsed.logoHorizontalUrl,
      logoStackedUrl: parsed.logoStackedUrl,
    },
  });

  // Branding reaches the app chrome, every bill and the login screen, so
  // the whole tree is revalidated rather than one path.
  revalidatePath("/", "layout");
}

/** Puts every field back to the values in src/lib/brand.ts. */
export async function resetBranding() {
  const session = await ownerOnly();

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      brandShortName: null,
      brandTagline: null,
      brandDescription: null,
      primaryColor: null,
      accentColor: null,
      surfaceColor: null,
      invoiceHeaderText: null,
      invoicePaperDefault: null,
      showLogoOnInvoice: true,
      upiId: null,
      supportEmail: null,
      websiteUrl: null,
      hoursHeadline: null,
      hoursNote: null,
      logoIconUrl: null,
      logoHorizontalUrl: null,
      logoStackedUrl: null,
      brandingUpdatedAt: new Date(),
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "branding.reset",
    entity: "Tenant",
    entityId: session.user.tenantId,
    after: {
      primaryColor: BRAND.themeColor,
      accentColor: BRAND_ACCENT,
      surfaceColor: BRAND.backgroundColor,
    },
  });

  revalidatePath("/", "layout");
}
