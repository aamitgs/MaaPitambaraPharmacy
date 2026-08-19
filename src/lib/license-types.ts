export const LICENSE_TYPES = ["retail", "wholesale", "narcotic", "fssai"] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];
