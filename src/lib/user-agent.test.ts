import { describe, it, expect } from "vitest";
import { describeDevice } from "./user-agent";

describe("describing a device", () => {
  it("names the browsers a pharmacy actually uses", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 Edg/151.0.0.0")).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")).toBe("Safari on Mac");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox on Windows");
  });

  it("does not call Chrome 'Safari', which its own UA string claims to be", () => {
    const chrome = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";
    expect(describeDevice(chrome)).toBe("Chrome on Android");
  });

  it("does not call Android 'Linux', which its own UA string also claims", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36"))
      .toContain("Android");
  });

  it("says so plainly when it cannot tell", () => {
    expect(describeDevice(null)).toBe("Unknown device");
    expect(describeDevice("curl/8.4.0")).toBe("Browser on Unknown system");
  });
});
