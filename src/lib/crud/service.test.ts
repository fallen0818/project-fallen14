import { describe, it, expect } from "vitest";
import { computeNextCode } from "./service";

describe("computeNextCode", () => {
  it("starts at 1 when there are no codes", () => {
    expect(computeNextCode([], "CAPEX-", 6)).toBe("CAPEX-000001");
  });

  it("increments the max numeric suffix", () => {
    expect(computeNextCode(["CAPEX-000001", "CAPEX-000042"], "CAPEX-", 6)).toBe(
      "CAPEX-000043",
    );
  });

  it("ignores codes with a different prefix", () => {
    expect(computeNextCode(["PO-000009", "CAPEX-000003"], "CAPEX-", 6)).toBe(
      "CAPEX-000004",
    );
  });

  it("respects the padding width", () => {
    expect(computeNextCode(["APPX-0007"], "APPX-", 4)).toBe("APPX-0008");
  });

  it("handles year-scoped prefixes", () => {
    expect(computeNextCode(["CBUD-2026-0002"], "CBUD-2026-", 4)).toBe("CBUD-2026-0003");
  });

  it("skips malformed suffixes", () => {
    expect(computeNextCode(["CAPEX-abc", "CAPEX-000005"], "CAPEX-", 6)).toBe(
      "CAPEX-000006",
    );
  });
});
