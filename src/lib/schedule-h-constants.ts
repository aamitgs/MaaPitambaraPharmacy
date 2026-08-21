/**
 * Constants for the Schedule H/H1 register. Separate from the server action
 * because a `"use server"` module may only export async functions — a plain
 * const there is a build error, and one Next raises rather than tsc.
 */

/** Rule 65(11A): the H1 register must be kept for three years. */
export const H1_RETENTION_YEARS = 3;
