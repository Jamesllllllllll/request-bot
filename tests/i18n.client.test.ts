import { describe, expect, it } from "vitest";
import { getSyncedLocaleFromInitial } from "~/lib/i18n/client";

describe("getSyncedLocaleFromInitial", () => {
  it("keeps the user's selected locale when the incoming initial locale has not changed", () => {
    expect(
      getSyncedLocaleFromInitial({
        currentLocale: "fr",
        previousInitialLocale: "en",
        nextInitialLocale: "en",
      })
    ).toBe("fr");
  });

  it("syncs to a new initial locale when the parent prop actually changes", () => {
    expect(
      getSyncedLocaleFromInitial({
        currentLocale: "en",
        previousInitialLocale: "en",
        nextInitialLocale: "fr",
      })
    ).toBe("fr");
  });

  it("does nothing when the current locale already matches the new initial locale", () => {
    expect(
      getSyncedLocaleFromInitial({
        currentLocale: "fr",
        previousInitialLocale: "en",
        nextInitialLocale: "fr",
      })
    ).toBe("fr");
  });
});
