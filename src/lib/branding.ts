import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";

/**
 * The one place branding is resolved. Tenant row wins; `BRAND` is the
 * fallback, so an install that has never opened /branding looks exactly as
 * it does today.
 *
 * No session argument: this is a single-tenant install, and the login
 * screen, the PWA manifest and the favicon all need branding before there
 * is a session to scope it by. When this becomes multi-tenant, this
 * function grows a tenant/host argument and nothing else in the app moves —
 * that is the whole reason every consumer reads through it.
 *
 * `cache()` dedupes the query within a single request, so a page that shows
 * the logo, the name and a themed colour still hits the database once.
 */
export type Branding = {
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  logo: { icon: string; horizontal: string; stacked: string };
  /** True when the logo is uploaded artwork rather than the bundled default. */
  hasCustomLogo: boolean;
  colors: { primary: string; accent: string; surface: string };
  invoice: {
    headerText: string;
    footerText: string;
    termsText: string;
    paperDefault: string;
    showLogo: boolean;
  };
  contact: {
    email: string;
    mobile: string;
    landline: string;
    website: string;
    upiId: string;
  };
  hours: { headline: string; note: string };
};

/** Bundled artwork in public/, used until an owner uploads their own. */
const DEFAULT_LOGOS = {
  icon: "/logo-icon.png",
  horizontal: "/logo-horizontal.png",
  stacked: "/logo-stacked.png",
} as const;

export const getBranding = cache(async (): Promise<Branding> => {
  // Branding is owner-editable at runtime, so it must never be baked into a
  // build: a rename or a new logo has to show up without a redeploy. This
  // stops prerendering here, which keeps every consumer — the root layout's
  // metadata, the PWA manifest, the login screen — rendering per request.
  // Without it `next build` tries to reach the database from the build
  // machine, which is how the first deploy failed.
  await connection();

  const tenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: "asc" },
  });

  // The cache-buster rides on every uploaded-logo URL. Without it a browser
  // that fetched the old logo keeps showing it after a swap, which reads as
  // "the upload didn't work".
  const v = tenant?.brandingUpdatedAt?.getTime() ?? 0;
  const asset = (path: string | null | undefined, fallback: string) =>
    path ? `/api/brand/${path.split("/").pop()}?v=${v}` : fallback;

  return {
    name: tenant?.pharmacyName ?? BRAND.name,
    shortName: tenant?.brandShortName ?? BRAND.shortName,
    tagline: tenant?.brandTagline ?? BRAND.tagline,
    description: tenant?.brandDescription ?? BRAND.description,
    logo: {
      icon: asset(tenant?.logoIconUrl, DEFAULT_LOGOS.icon),
      horizontal: asset(tenant?.logoHorizontalUrl, DEFAULT_LOGOS.horizontal),
      stacked: asset(tenant?.logoStackedUrl, DEFAULT_LOGOS.stacked),
    },
    hasCustomLogo: Boolean(
      tenant?.logoIconUrl || tenant?.logoHorizontalUrl || tenant?.logoStackedUrl
    ),
    colors: {
      primary: tenant?.primaryColor ?? BRAND.themeColor,
      accent: tenant?.accentColor ?? BRAND_ACCENT,
      surface: tenant?.surfaceColor ?? BRAND.backgroundColor,
    },
    invoice: {
      headerText: tenant?.invoiceHeaderText ?? "",
      footerText: tenant?.invoiceFooterText ?? BRAND.invoiceFooterText,
      termsText: tenant?.invoiceTermsText ?? BRAND.invoiceTermsText,
      paperDefault: tenant?.invoicePaperDefault ?? "a5",
      showLogo: tenant?.showLogoOnInvoice ?? true,
    },
    contact: {
      email: tenant?.supportEmail ?? BRAND.contact.email,
      mobile: BRAND.contact.mobile,
      landline: BRAND.contact.landline,
      website: tenant?.websiteUrl ?? "",
      upiId: tenant?.upiId ?? BRAND.contact.upiId,
    },
    hours: {
      headline: tenant?.hoursHeadline ?? BRAND.hours.headline,
      note: tenant?.hoursNote ?? BRAND.hours.note,
    },
  };
});

/**
 * Brand gold, as a hex mirror of --brand-gold in globals.css. BRAND only
 * carries the maroon and the cream (the two the PWA manifest needs), so the
 * accent's default lives here rather than being invented at the call site.
 */
export const BRAND_ACCENT = "#c9922f";
