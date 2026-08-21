/**
 * Turns a user-agent string into something a person recognises.
 *
 * The point is not accuracy about versions — it is letting someone look at
 * a list of their own sessions and say "that one is the counter PC, that
 * one is my phone, and I do not know what that third one is."
 */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    // Chrome's UA also claims Safari, so Chrome has to be ruled out first.
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";

  const platform =
    /Windows NT/.test(ua) ? "Windows"
    : /iPhone|iPad|iPod/.test(ua) ? "iPhone or iPad"
    // Android must be tested before Linux: every Android UA says Linux too.
    : /Android/.test(ua) ? "Android"
    : /Macintosh|Mac OS X/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown system";

  return `${browser} on ${platform}`;
}
