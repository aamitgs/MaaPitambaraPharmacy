/**
 * Single source of truth for Maa Pitambara Pharmacy's own brand strings,
 * used in the app chrome (browser title, login screen, sidebar, PWA
 * manifest) and as the seed values for the tenant/branch rows.
 *
 * Per-tenant data in the database still wins wherever it exists —
 * `Tenant.pharmacyName` and the `Branch` columns drive receipts, the
 * dashboard heading, and the sidebar, and are editable from the UI. These
 * constants are the build-time identity: what the tab says before anyone
 * signs in, and the fallback when a tenant row is missing.
 */
export const BRAND = {
  name: "Maa Pitambara Pharmacy",
  /** As printed in the registration record. */
  legalName: "MAA PITAMBARA PHARMACY",
  /** Compact form for the PWA home-screen label and tight layouts. */
  shortName: "MPP",
  tagline: "Counter billing, inventory & GST compliance",
  description:
    "Maa Pitambara Pharmacy, Agra — GST-compliant counter billing, purchase & inventory, and Schedule H/X compliance.",

  contact: {
    email: "aamitgs@gmail.com",
    mobile: "+91 8010306757",
    /** Shop landline, Agra STD code 0562. */
    landline: "0562-3501227",
    addressLine1: "16, H.I.G. Shaheed Nagar",
    city: "Agra",
    state: "Uttar Pradesh",
    /** GST state code 09 — matches the GSTIN prefix below. */
    stateCode: "09",
    /** Payee VPA for the "Scan & pay" QR printed on every bill. */
    upiId: "8010306757@okbizaxis",
    pincode: "282001",
  },

  registration: {
    gstin: "09APFPS2581C1ZT",
    /** Characters 3–12 of the GSTIN are the PAN. */
    pan: "APFPS2581C",
    /** Form 20 — retail sale of drugs. */
    drugLicenseRetailNo: "UP80200001841",
    /** Form 21 — wholesale. */
    drugLicenseWholesaleNo: "UP80210001843",
    fssaiNo: "22724590000019",
  },

  /** Default footer printed on receipts when a tenant hasn't set its own.
   *  Editable per tenant in the database, so this is only the starting
   *  value — change the wording in Settings, not here. "|" splits it into
   *  separate lines on a thermal roll. Contact details are deliberately not
   *  here: the phone prints in the bill header, from the branch record. */
  invoiceFooterText:
    "Get well soon — take your medicines on time, and finish the full course. | Thank you for visiting Maa Pitambara Pharmacy.",

  /** Legal terms, printed under their own heading below the footer. "|"
   *  separates individual terms. Editable per tenant in the database. */
  invoiceTermsText:
    "Medicines once sold are not returnable. | All disputes subject to AGRA jurisdiction only.",

  /** Primary Maroon and Cream Background from the brand sheet, mirrored
   *  from `--brand-maroon` / `--brand-cream` in globals.css. Used where a
   *  literal hex is required (PWA manifest, theme-color meta). */
  themeColor: "#6E1B3A",
  backgroundColor: "#FFF8EF",
} as const;

/**
 * Postal address as printed on receipts and debit notes, stored with a real
 * newline between the premises and the city line. The bill renders it with
 * `whitespace-pre-line`; anywhere else HTML collapses the newline to a
 * space, so it degrades to the single-line form rather than breaking.
 */
export const BRAND_ADDRESS = `${BRAND.contact.addressLine1}\n${BRAND.contact.city}, ${BRAND.contact.state} ${BRAND.contact.pincode}`;
