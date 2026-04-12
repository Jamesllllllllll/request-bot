import { describe, expect, it } from "vitest";
import {
  getAvailableRequestedPaths,
  getRequestVipTokenPlan,
} from "~/lib/requested-paths";

describe("getRequestVipTokenPlan", () => {
  const thresholds = [
    {
      minimumDurationMinutes: 7,
      tokenCost: 2,
    },
  ];

  it("adds paid path costs to regular and VIP requests", () => {
    const regularPlan = getRequestVipTokenPlan({
      requestKind: "regular",
      song: {
        durationText: "04:30",
      },
      requestedPaths: ["bass"],
      thresholds: [],
      settings: {
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: JSON.stringify(["bass"]),
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: true,
      },
    });

    const vipPlan = getRequestVipTokenPlan({
      requestKind: "vip",
      song: {
        durationText: "04:30",
      },
      requestedPaths: ["bass"],
      thresholds: [],
      settings: {
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: JSON.stringify(["bass"]),
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: true,
      },
    });

    expect(regularPlan).toMatchObject({
      requestedPathVipTokenCost: 1,
      pathSelectionUsesVipPriority: false,
      regularRequestRequiresVip: false,
      totalVipTokenCost: 1,
    });
    expect(vipPlan.totalVipTokenCost).toBe(2);
  });

  it("keeps additive path pricing even if VIP priority was disabled before", () => {
    const regularPlan = getRequestVipTokenPlan({
      requestKind: "regular",
      song: {
        durationText: "04:30",
      },
      requestedPaths: ["bass"],
      thresholds: [],
      settings: {
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: JSON.stringify(["bass"]),
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: false,
      },
    });

    const vipPlan = getRequestVipTokenPlan({
      requestKind: "vip",
      song: {
        durationText: "04:30",
      },
      requestedPaths: ["bass"],
      thresholds: [],
      settings: {
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: JSON.stringify(["bass"]),
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: false,
      },
    });

    expect(regularPlan).toMatchObject({
      requestedPathVipTokenCost: 1,
      pathSelectionUsesVipPriority: false,
      regularRequestRequiresVip: false,
      totalVipTokenCost: 1,
    });
    expect(vipPlan.totalVipTokenCost).toBe(2);
  });

  it("adds path and duration costs to regular requests, then adds VIP on top", () => {
    const regularPlan = getRequestVipTokenPlan({
      requestKind: "regular",
      song: {
        durationText: "08:30",
      },
      requestedPaths: ["bass"],
      thresholds,
      settings: {
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: JSON.stringify(["bass"]),
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: false,
      },
    });
    const vipPriorityPlan = getRequestVipTokenPlan({
      requestKind: "vip",
      song: {
        durationText: "08:30",
      },
      requestedPaths: ["bass"],
      thresholds,
      settings: {
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: JSON.stringify(["bass"]),
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: true,
      },
    });

    const regularPriorityPlan = getRequestVipTokenPlan({
      requestKind: "vip",
      song: {
        durationText: "08:30",
      },
      requestedPaths: ["bass"],
      thresholds,
      settings: {
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: JSON.stringify(["bass"]),
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: false,
      },
    });

    expect(regularPlan).toMatchObject({
      regularRequestRequiresVip: false,
      requestedPathVipTokenCost: 1,
      requiredSongVipTokenCost: 2,
      totalVipTokenCost: 3,
    });
    expect(vipPriorityPlan.totalVipTokenCost).toBe(4);
    expect(regularPriorityPlan.totalVipTokenCost).toBe(4);
  });

  it("uses per-path VIP token costs and explains the contributing reasons", () => {
    const vipPlan = getRequestVipTokenPlan({
      requestKind: "vip",
      song: {
        durationText: "09:30",
      },
      requestedPaths: ["bass"],
      thresholds,
      settings: {
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: JSON.stringify(["guitar", "bass"]),
        requestPathModifierGuitarVipTokenCost: 0,
        requestPathModifierLeadVipTokenCost: 0,
        requestPathModifierRhythmVipTokenCost: 0,
        requestPathModifierBassVipTokenCost: 1,
        requestPathModifierUsesVipPriority: true,
      },
    });

    expect(vipPlan.totalVipTokenCost).toBe(4);
    expect(vipPlan.vipTokenReasons).toEqual([
      {
        type: "base_vip",
        cost: 1,
      },
      {
        type: "duration",
        cost: 2,
        minimumDurationMinutes: 7,
      },
      {
        type: "requested_path",
        path: "bass",
        cost: 1,
      },
    ]);
  });

  it("offers guitar when a song includes lead or rhythm", () => {
    expect(getAvailableRequestedPaths(["lead"], ["guitar"])).toEqual([
      "guitar",
    ]);
    expect(
      getAvailableRequestedPaths(["lead", "rhythm", "bass"], ["guitar", "bass"])
    ).toEqual(["guitar", "bass"]);
  });

  it("ignores saved path selections when request modifiers are disabled", () => {
    const regularPlan = getRequestVipTokenPlan({
      requestKind: "regular",
      song: {
        durationText: "04:30",
      },
      requestedPaths: ["bass"],
      thresholds: [],
      settings: {
        allowRequestPathModifiers: false,
        allowedRequestPathsJson: JSON.stringify(["bass"]),
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: true,
      },
    });

    expect(regularPlan).toMatchObject({
      requestedPathVipTokenCost: 0,
      pathSelectionUsesVipPriority: false,
      regularRequestRequiresVip: false,
      totalVipTokenCost: 0,
    });
  });
});
