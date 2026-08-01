import { describe, it, expect } from "vitest";
import { escapeCsvValue, toCsv, formatCurrency, formatPercent } from "./utils";

describe("escapeCsvValue", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("neutralises formula injection", () => {
    expect(escapeCsvValue("=1+1")).toBe("'=1+1");
    expect(escapeCsvValue("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvValue("@cmd")).toBe("'@cmd");
  });

  it("quotes values containing commas or quotes", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });

  it("leaves plain values untouched", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
    expect(escapeCsvValue(42)).toBe("42");
  });
});

describe("toCsv", () => {
  it("builds a header row and data rows", () => {
    const csv = toCsv([{ a: 1, b: "x" }], [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ]);
    expect(csv).toBe("A,B\n1,x");
  });
});

describe("formatters", () => {
  it("formats currency and percent, with fallbacks", () => {
    expect(formatCurrency(1500)).toBe("₱1,500");
    expect(formatCurrency(null)).toBe("—");
    expect(formatPercent(42.5)).toBe("42.5%");
    expect(formatPercent(null)).toBe("—");
  });
});
