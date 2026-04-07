import { describe, expect, it } from "vitest";
import {
  formatCompactTuningSummary,
  getUniqueTunings,
} from "~/lib/tuning-summary";

describe("tuning summary helpers", () => {
  it("deduplicates tunings while preserving the first seen label", () => {
    expect(
      getUniqueTunings([
        "E Standard",
        "E Standard | E Flat",
        "e standard | Drop D",
      ])
    ).toEqual(["E Standard", "E Flat", "Drop D"]);
  });

  it("formats a compact summary from the first unique tuning", () => {
    expect(
      formatCompactTuningSummary(["E Standard", "E Standard", "E Flat"])
    ).toBe("E Standard +1");
  });

  it("counts all unique follow-up tunings", () => {
    expect(
      formatCompactTuningSummary([
        "E Standard",
        "A Standard",
        "Drop D",
        "Drop C",
      ])
    ).toBe("E Standard +3");
  });

  it("returns the original tuning when only one unique tuning exists", () => {
    expect(formatCompactTuningSummary(["E Standard | E Standard"])).toBe(
      "E Standard"
    );
  });

  it("returns undefined when no tuning values are present", () => {
    expect(formatCompactTuningSummary([undefined, "", null])).toBeUndefined();
  });
});
