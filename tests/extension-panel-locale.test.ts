import { describe, expect, it } from "vitest";
import { resolveExtensionPanelLocale } from "~/extension/panel/locale";

describe("resolveExtensionPanelLocale", () => {
  it("prefers Twitch locale query params when they are present", () => {
    expect(
      resolveExtensionPanelLocale({
        search: "?locale=pt-BR&language=pt",
        documentLanguage: "en",
        navigatorLanguage: "fr-CA",
      })
    ).toBe("pt-BR");
  });

  it("falls back from Twitch language query params to a supported base locale", () => {
    expect(
      resolveExtensionPanelLocale({
        search: "?language=es-MX",
        documentLanguage: "en",
        navigatorLanguage: "fr-CA",
      })
    ).toBe("es");
  });

  it("uses the document language before the browser language when query params are missing", () => {
    expect(
      resolveExtensionPanelLocale({
        search: "",
        documentLanguage: "fr-CA",
        navigatorLanguage: "es-MX",
      })
    ).toBe("fr");
  });

  it("prefers a linked viewer preference before local device settings", () => {
    expect(
      resolveExtensionPanelLocale({
        search: "?language=fr",
        storedLocale: "pt-BR",
        cookieLocale: "es",
        viewerPreferredLocale: "fr",
        channelDefaultLocale: "en",
        documentLanguage: "en",
        navigatorLanguage: "en-US",
      })
    ).toBe("fr");
  });

  it("uses the stored device locale before queryless document and browser fallbacks", () => {
    expect(
      resolveExtensionPanelLocale({
        search: "",
        storedLocale: "pt-BR",
        cookieLocale: "es",
        documentLanguage: "fr-CA",
        navigatorLanguage: "en-US",
      })
    ).toBe("pt-BR");
  });

  it("falls back to the channel default locale after device preferences are exhausted", () => {
    expect(
      resolveExtensionPanelLocale({
        search: "",
        storedLocale: null,
        cookieLocale: null,
        channelDefaultLocale: "es",
        documentLanguage: "de-DE",
        navigatorLanguage: "de-DE",
      })
    ).toBe("es");
  });

  it("falls back to English when no supported locale can be resolved", () => {
    expect(
      resolveExtensionPanelLocale({
        search: "?locale=de-DE",
        documentLanguage: "de-DE",
        navigatorLanguage: "de-DE",
      })
    ).toBe("en");
  });
});
