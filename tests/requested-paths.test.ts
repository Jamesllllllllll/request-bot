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

  it("treats a paid path as VIP-only when the channel uses VIP priority", () => {
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
      pathSelectionUsesVipPriority: true,
      regularRequestRequiresVip: true,
      totalVipTokenCost: 0,
    });
    expect(vipPlan.totalVipTokenCost).toBe(1);
  });

  it("lets a paid path stay regular when the channel disables VIP priority", () => {
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

  it("adds path cost on top of duration-based VIP cost only when VIP priority is disabled", () => {
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

    expect(vipPriorityPlan.totalVipTokenCost).toBe(2);
    expect(regularPriorityPlan.totalVipTokenCost).toBe(3);
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
      pathSelectionUsesVipPriority: true,
      regularRequestRequiresVip: false,
      totalVipTokenCost: 0,
    });
  });
});
