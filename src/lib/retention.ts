/**
 * How long patient details are kept.
 *
 * Two rules pull in opposite directions and both are binding:
 *
 *  - Records that the law requires must not be deleted early. A Schedule
 *    H1 dispensing entry has a three-year minimum under Rule 65(11A) of
 *    the Drugs and Cosmetics Rules, and GST records have their own
 *    retention under section 36 of the CGST Act.
 *  - Records the law does not require should not be kept forever. A
 *    walk-in customer's name, age, phone and address on an ordinary
 *    paracetamol bill serve no purpose five years later, and keeping them
 *    is a liability, not an asset.
 *
 * So this module never deletes an invoice. It redacts the personal fields
 * on invoices old enough that nothing requires them any more, leaving the
 * bill, its lines, its totals and its tax exactly intact — the accounting
 * record survives in full, the person does not.
 */

/// Statutory floors. These are minimums set by law, not preferences, so
/// nothing in the settings may go below them.
export const RETENTION_FLOORS = {
  /// Rule 65(11A), Drugs and Cosmetics Rules — Schedule H1 register.
  scheduleH1Years: 3,
  /// Section 36, CGST Act: 72 months from the due date of the annual
  /// return. Six years is the safe reading and the one used here.
  gstRecordYears: 6,
} as const;

/// Below this, redaction is refused outright: any window shorter than the
/// longest statutory floor would delete something the law requires.
export const MINIMUM_RETENTION_YEARS = Math.max(
  RETENTION_FLOORS.scheduleH1Years,
  RETENTION_FLOORS.gstRecordYears
);

export type RetentionDecision =
  | { redact: true; cutoff: Date }
  | { redact: false; reason: string };

/**
 * Whether a redaction run may proceed, and the date before which invoices
 * are eligible.
 *
 * Returning a refusal rather than clamping silently: an owner who typed
 * "2 years" needs to be told why it cannot happen, not quietly given six.
 */
export function planRedaction(years: number, now: Date = new Date()): RetentionDecision {
  if (!Number.isFinite(years) || years <= 0) {
    return { redact: false, reason: "Enter how many years of patient details to keep." };
  }
  if (years < MINIMUM_RETENTION_YEARS) {
    return {
      redact: false,
      reason:
        `Patient details cannot be cleared before ${MINIMUM_RETENTION_YEARS} years. ` +
        `Schedule H1 records must be kept ${RETENTION_FLOORS.scheduleH1Years} years under ` +
        `Rule 65(11A), and GST records ${RETENTION_FLOORS.gstRecordYears} years under section 36 ` +
        `of the CGST Act.`,
    };
  }

  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return { redact: true, cutoff };
}

/// What a redacted field reads as afterwards. Not an empty string: a blank
/// name is indistinguishable from one that was never captured, and someone
/// auditing the bill later should be able to tell the difference.
export const REDACTED = "[removed on retention]";
