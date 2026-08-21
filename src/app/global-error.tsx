"use client";

/**
 * The boundary of last resort — it replaces the whole document, including
 * the app shell, so it cannot use any of the app's layout or providers.
 *
 * Deliberately plain: whatever broke may be the very thing that renders
 * buttons and icons, so this uses nothing but inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600 }}>The app could not start this page.</h1>
        <p style={{ color: "#666", maxWidth: "36rem", margin: "0.75rem auto" }}>
          Reload to try again. If it keeps happening, note the reference below — it identifies this
          fault in the server log.
        </p>
        {error.digest && (
          <code style={{ background: "#f4f4f5", padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
            Reference {error.digest}
          </code>
        )}
        <div style={{ marginTop: "1.25rem" }}>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1rem", border: "1px solid #ccc", borderRadius: "0.375rem", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
