import { describe, expect, it } from "vitest";
import {
  getEffectiveVipTokenCost,
  getNextVipTokenDurationThreshold,
  getRequiredVipTokenCostForDuration,
  getRequiredVipTokenCostForSong,
  normalizeVipTokenDurationThresholds,
  parseDurationTextToSeconds,
  parseVipTokenDurationThresholds,
  serializeVipTokenDurationThresholds,
} from "~/lib/vip-token-duration-thresholds";

describe("vip token duration thresholds", () => {
  it("normalizes and sorts thresholds", () => {
    expect(
      normalizeVipTokenDurationThresholds([
        {
          minimumDurationMinutes: 9,
          tokenCost: 2,
        },
        {
          minimumDurationMinutes: 7,
          tokenCost: 1,
        },
        {
          minimumDurationMinutes: 9,
          tokenCost: 3,
        },
      ])
    ).toEqual([
      {
        minimumDurationMinutes: 7,
        tokenCost: 1,
      },
      {
        minimumDurationMinutes: 9,
        tokenCost: 3,
      },
    ]);
  });

  it("parses and serializes threshold JSON", () => {
    const serialized = serializeVipTokenDurationThresholds([
      {
        minimumDurationMinutes: 7,
        tokenCost: 1,
      },
      {
        minimumDurationMinutes: 11,
        tokenCost: 3,
      },
    ]);

    expect(parseVipTokenDurationThresholds(serialized)).toEqual([
      {
        minimumDurationMinutes: 7,
        tokenCost: 1,
      },
      {
        minimumDurationMinutes: 11,
        tokenCost: 3,
      },
    ]);
  });

  it("builds a distinct next threshold default for the settings UI", () => {
    expect(getNextVipTokenDurationThreshold([])).toEqual({
      minimumDurationMinutes: 7,
      tokenCost: 1,
    });

    expect(
      getNextVipTokenDurationThreshold([
        {
          minimumDurationMinutes: 7,
          tokenCost: 1,
        },
      ])
    ).toEqual({
      minimumDurationMinutes: 9,
      tokenCost: 2,
    });

    expect(
      getNextVipTokenDurationThreshold([
        {
          minimumDurationMinutes: 7,
          tokenCost: 1,
        },
        {
          minimumDurationMinutes: 9,
          tokenCost: 2,
        },
      ])
    ).toEqual({
      minimumDurationMinutes: 11,
      tokenCost: 3,
    });
  });

  it("parses duration text into seconds", () => {
    expect(parseDurationTextToSeconds("7:01")).toBe(421);
    expect(parseDurationTextToSeconds("1:02:03")).toBe(3723);
    expect(parseDurationTextToSeconds("7:61")).toBeNull();
  });

  it("calculates required VIP cost for duration thresholds", () => {
    const thresholds = parseVipTokenDurationThresholds(
      JSON.stringify([
        {
          minimumDurationMinutes: 7,
          tokenCost: 1,
        },
        {
          minimumDurationMinutes: 9,
          tokenCost: 2,
        },
        {
          minimumDurationMinutes: 11,
          tokenCost: 3,
        },
      ])
    );

    expect(getRequiredVipTokenCostForDuration(420, thresholds)).toBe(0);
    expect(getRequiredVipTokenCostForDuration(421, thresholds)).toBe(1);
    expect(getRequiredVipTokenCostForDuration(541, thresholds)).toBe(2);
    expect(getRequiredVipTokenCostForDuration(661, thresholds)).toBe(3);
  });

  it("uses duration seconds when present on the song", () => {
    const thresholds = parseVipTokenDurationThresholds(
      JSON.stringify([
        {
          minimumDurationMinutes: 7,
          tokenCost: 1,
        },
      ])
    );

    expect(
      getRequiredVipTokenCostForSong(
        {
          durationSeconds: 500,
          durationText: "4:00",
        },
        thresholds
      )
    ).toBe(1);
  });

  it("uses the greater of the explicit and threshold-based VIP cost", () => {
    const thresholds = parseVipTokenDurationThresholds(
      JSON.stringify([
        {
          minimumDurationMinutes: 7,
          tokenCost: 2,
        },
      ])
    );

    expect(
      getEffectiveVipTokenCost({
        requestKind: "vip",
        explicitVipTokenCost: 1,
        song: {
          durationText: "8:05",
        },
        thresholds,
      })
    ).toBe(2);

    expect(
      getEffectiveVipTokenCost({
        requestKind: "vip",
        explicitVipTokenCost: 3,
        song: {
          durationText: "8:05",
        },
        thresholds,
      })
    ).toBe(3);

    expect(
      getEffectiveVipTokenCost({
        requestKind: "regular",
        explicitVipTokenCost: 5,
        song: {
          durationText: "12:00",
        },
        thresholds,
      })
    ).toBe(0);
  });
});
