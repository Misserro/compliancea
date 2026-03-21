import { describe, it, expect } from "vitest";
import { calculateCourtFee } from "../../src/lib/court-fee";

describe("calculateCourtFee — fixed brackets", () => {
  it("0 PLN → 30", () => expect(calculateCourtFee(0)).toBe(30));
  it("400 PLN → 30", () => expect(calculateCourtFee(400)).toBe(30));
  it("500 PLN → 30 (upper edge of bracket 1)", () => expect(calculateCourtFee(500)).toBe(30));
  it("500.01 PLN → 100 (lower edge of bracket 2)", () => expect(calculateCourtFee(500.01)).toBe(100));
  it("1200 PLN → 100", () => expect(calculateCourtFee(1200)).toBe(100));
  it("1500 PLN → 100 (upper edge of bracket 2)", () => expect(calculateCourtFee(1500)).toBe(100));
  it("1500.01 PLN → 200", () => expect(calculateCourtFee(1500.01)).toBe(200));
  it("3500 PLN → 200", () => expect(calculateCourtFee(3500)).toBe(200));
  it("4000 PLN → 200 (upper edge of bracket 3)", () => expect(calculateCourtFee(4000)).toBe(200));
  it("4000.01 PLN → 400", () => expect(calculateCourtFee(4000.01)).toBe(400));
  it("7000 PLN → 400", () => expect(calculateCourtFee(7000)).toBe(400));
  it("7500 PLN → 400 (upper edge of bracket 4)", () => expect(calculateCourtFee(7500)).toBe(400));
  it("7500.01 PLN → 500", () => expect(calculateCourtFee(7500.01)).toBe(500));
  it("9000 PLN → 500", () => expect(calculateCourtFee(9000)).toBe(500));
  it("10000 PLN → 500 (upper edge of bracket 5)", () => expect(calculateCourtFee(10000)).toBe(500));
  it("10000.01 PLN → 750", () => expect(calculateCourtFee(10000.01)).toBe(750));
  it("12000 PLN → 750", () => expect(calculateCourtFee(12000)).toBe(750));
  it("15000 PLN → 750 (upper edge of bracket 6)", () => expect(calculateCourtFee(15000)).toBe(750));
  it("15000.01 PLN → 1000", () => expect(calculateCourtFee(15000.01)).toBe(1000));
  it("18000 PLN → 1000", () => expect(calculateCourtFee(18000)).toBe(1000));
  it("20000 PLN → 1000 (last fixed bracket)", () => expect(calculateCourtFee(20000)).toBe(1000));
});

describe("calculateCourtFee — proportional (> 20 000 PLN)", () => {
  it("20000.01 PLN → ~1000.0005 (proportional starts)", () => {
    const fee = calculateCourtFee(20000.01);
    expect(fee).toBeCloseTo(1000.0005, 3);
  });
  it("47500 PLN → 2375", () => expect(calculateCourtFee(47500)).toBe(2375));
  it("1000000 PLN → 50000", () => expect(calculateCourtFee(1000000)).toBe(50000));
  it("2000000 PLN → 100000 (cap)", () => expect(calculateCourtFee(2000000)).toBe(100000));
  it("3000000 PLN → 100000 (cap)", () => expect(calculateCourtFee(3000000)).toBe(100000));
  it("10000000 PLN → 100000 (cap holds)", () => expect(calculateCourtFee(10000000)).toBe(100000));
});

describe("calculateCourtFee — invalid inputs", () => {
  it("null → null", () => expect(calculateCourtFee(null)).toBeNull());
  it("-1 PLN → null", () => expect(calculateCourtFee(-1)).toBeNull());
  it("-0.01 PLN → null", () => expect(calculateCourtFee(-0.01)).toBeNull());
  it("NaN → null", () => expect(calculateCourtFee(NaN)).toBeNull());
  it("Infinity → null", () => expect(calculateCourtFee(Infinity)).toBeNull());
  it("-Infinity → null", () => expect(calculateCourtFee(-Infinity)).toBeNull());
});
