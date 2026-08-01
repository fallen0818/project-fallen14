import { describe, it, expect } from "vitest";
import { validateField, validateValues } from "./validation";
import type { FieldDef } from "./types";

const f = (over: Partial<FieldDef>): FieldDef => ({
  name: "x",
  label: "X",
  type: "text",
  ...over,
});

describe("validateField", () => {
  it("flags required empty fields", () => {
    expect(validateField(f({ required: true }), "")).toBe("X is required");
    expect(validateField(f({ required: true }), null)).toBe("X is required");
  });

  it("passes optional empty fields", () => {
    expect(validateField(f({}), "")).toBeNull();
  });

  it("never validates read-only fields", () => {
    expect(validateField(f({ readOnly: true, required: true }), "")).toBeNull();
  });

  it("rejects non-numeric numbers", () => {
    expect(validateField(f({ type: "number" }), "abc")).toBe("X must be a number");
  });

  it("rejects negative currency", () => {
    expect(validateField(f({ type: "currency" }), -5)).toBe("X cannot be negative");
    expect(validateField(f({ type: "currency" }), 100)).toBeNull();
  });

  it("enforces min/max bounds", () => {
    const pct = f({ type: "number", min: 0, max: 100, label: "Progress" });
    expect(validateField(pct, 150)).toBe("Progress must be at most 100");
    expect(validateField(pct, -1)).toBe("Progress must be at least 0");
    expect(validateField(pct, 50)).toBeNull();
  });

  it("validates ISO currency codes", () => {
    const cur = f({ name: "currency", label: "Currency" });
    expect(validateField(cur, "usd")).toMatch(/3-letter ISO/);
    expect(validateField(cur, "PHP")).toBeNull();
  });

  it("rejects invalid dates", () => {
    expect(validateField(f({ type: "date" }), "2026-13-40")).toBe("X is not a valid date");
    expect(validateField(f({ type: "date" }), "2026-03-15")).toBeNull();
  });
});

describe("validateValues", () => {
  it("collects all errors across fields", () => {
    const fields = [
      f({ name: "title", label: "Title", required: true }),
      f({ name: "currency", label: "Currency" }),
    ];
    const errors = validateValues(fields, { title: "", currency: "xx" });
    expect(errors).toHaveLength(2);
  });

  it("returns empty when all valid", () => {
    const fields = [f({ name: "title", label: "Title", required: true })];
    expect(validateValues(fields, { title: "ok" })).toEqual([]);
  });
});
