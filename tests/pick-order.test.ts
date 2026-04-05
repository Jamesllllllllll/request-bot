import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatPickOrdinal, getPickBadgeLabel } from "~/lib/pick-order";

describe("pick order labels", () => {
  it("formats later picks with the resolved ordinal", () => {
    const label = getPickBadgeLabel({
      locale: "en",
      pickNumber: 4,
      translate: (key, options) => {
        if (key === "row.picks.nth") {
          return `${options?.ordinal} pick`;
        }

        return key;
      },
    });

    expect(label).toBe("4th pick");
    expect(formatPickOrdinal("en", 4)).toBe("4th");
  });

  it("uses ICU-style ordinal placeholders in playlist locale resources", () => {
    const resourcePaths = [
      "repo/src/lib/i18n/resources/en/playlist.json",
      "repo/src/lib/i18n/resources/es/playlist.json",
      "repo/src/lib/i18n/resources/fr/playlist.json",
      "repo/src/lib/i18n/resources/pt-br/playlist.json",
    ];

    for (const resourcePath of resourcePaths) {
      const resource = JSON.parse(readFileSync(resourcePath, "utf8")) as {
        row?: { picks?: { nth?: string } };
      };

      expect(resource.row?.picks?.nth).toContain("{ordinal}");
      expect(resource.row?.picks?.nth).not.toContain("{{ordinal}}");
    }
  });
});
