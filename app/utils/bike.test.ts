import { describe, expect, it } from "vitest";
import { bikeDisplayName, bikeRaceBadge } from "./bike";

const model = { name: "Ohvale GP-0 110A" };

describe("bikeDisplayName", () => {
  it("joins nickname and race number, as printed on the grid sheet", () => {
    expect(bikeDisplayName({ alias: "Stoner", raceNumber: 27, model })).toBe("Stoner 27");
  });

  it("falls back to the nickname alone", () => {
    expect(bikeDisplayName({ alias: "Stoner", raceNumber: null, model })).toBe("Stoner");
  });

  it("falls back to the race number alone", () => {
    expect(bikeDisplayName({ alias: null, raceNumber: 27, model })).toBe("#27");
  });

  it("falls back to the model when the bike is unnamed", () => {
    expect(bikeDisplayName({ alias: null, raceNumber: null, model })).toBe("Ohvale GP-0 110A");
  });

  it("never renders an empty label", () => {
    expect(bikeDisplayName({})).toBe("Ohvale GP");
    expect(bikeDisplayName({ alias: "   ", raceNumber: null, model: { name: "  " } })).toBe("Ohvale GP");
  });

  it("treats race number zero as a real number", () => {
    expect(bikeDisplayName({ alias: "Zero", raceNumber: 0, model })).toBe("Zero 0");
    expect(bikeDisplayName({ alias: null, raceNumber: 0, model })).toBe("#0");
  });

  it("trims stray whitespace around a nickname", () => {
    expect(bikeDisplayName({ alias: "  Bagnaia  ", raceNumber: 63, model })).toBe("Bagnaia 63");
  });
});

describe("bikeRaceBadge", () => {
  it("renders the number when present", () => {
    expect(bikeRaceBadge({ raceNumber: 73 })).toBe("#73");
    expect(bikeRaceBadge({ raceNumber: 0 })).toBe("#0");
  });

  it("renders nothing without a number", () => {
    expect(bikeRaceBadge({ raceNumber: null })).toBeNull();
    expect(bikeRaceBadge({})).toBeNull();
  });
});
