import { describe, expect, it } from "vitest";
import { getSessionsBasePrice, roundMoney } from "./pricing";

// A representative weekday tariff: 25 per session, but from 3 sessions the
// rider pays 60 for the first three and 20 for each one after.
const TARIFF = {
  basePricePerSession: 25,
  discountThreshold: 3,
  discountThresholdPrice: 60,
  pricePerSessionAfterThreshold: 20,
};

function price(sessions: number) {
  return getSessionsBasePrice(
    sessions,
    TARIFF.basePricePerSession,
    TARIFF.discountThreshold,
    TARIFF.discountThresholdPrice,
    TARIFF.pricePerSessionAfterThreshold
  );
}

describe("getSessionsBasePrice", () => {
  it("charges full rate below the discount threshold", () => {
    expect(price(1)).toBe(25);
    expect(price(2)).toBe(50);
  });

  it("switches to the bundle price at the threshold", () => {
    expect(price(3)).toBe(60);
  });

  it("adds the reduced rate for each session past the threshold", () => {
    expect(price(4)).toBe(80);
    expect(price(6)).toBe(120);
  });

  it("never costs more than buying the same sessions at full rate", () => {
    for (let n = TARIFF.discountThreshold; n <= 10; n++) {
      expect(price(n)).toBeLessThanOrEqual(n * TARIFF.basePricePerSession);
    }
  });

  it("is monotonic — more sessions never costs less", () => {
    for (let n = 1; n < 10; n++) {
      expect(price(n + 1)).toBeGreaterThanOrEqual(price(n));
    }
  });

  it("treats zero sessions as free", () => {
    expect(price(0)).toBe(0);
  });

  it("crossing the threshold is not a price cliff downward", () => {
    // Buying the 3rd session must not cost less than buying only 2.
    expect(price(3)).toBeGreaterThanOrEqual(price(2));
  });
});

describe("roundMoney", () => {
  it("rounds to two decimals", () => {
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.006)).toBe(10.01);
  });

  it("clears float drift from accumulated modifiers", () => {
    const drifting = 0.1 + 0.2; // 0.30000000000000004
    expect(roundMoney(drifting)).toBe(0.3);
  });

  it("leaves whole amounts alone", () => {
    expect(roundMoney(120)).toBe(120);
  });
});
