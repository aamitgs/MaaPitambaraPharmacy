/**
 * Return type for every delete action wired to DeleteRowButton.
 *
 * A refused delete (a record with real history) is an expected outcome,
 * not a bug — this app's Next.js build redacts thrown Error messages
 * before a Client Component ever sees them, so a delete action must
 * return its refusal message rather than throw it.
 */
export type DeleteResult = { ok: true } | { ok: false; message: string };
