import { describe, expect, it } from "vitest";
import { buildLocaleCookie, getLocaleCookie } from "~/lib/auth/session.server";
import { resolveExplicitLocale } from "~/lib/i18n/detect";
import { normalizeLocale } from "~/lib/i18n/locales";
import { resolveRequestLocale } from "~/lib/i18n/server";

describe("normalizeLocale", () => {
  it("accepts supported locales", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("de")).toBe("de");
    expect(normalizeLocale("es")).toBe("es");
    expect(normalizeLocale("fr")).toBe("fr");
    expect(normalizeLocale("pt-BR")).toBe("pt-BR");
  });

  it("normalizes supported region-specific locales and base fallbacks", () => {
    expect(normalizeLocale("en-CA")).toBe("en");
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("pt-br")).toBe("pt-BR");
  });

  it("rejects unsupported locales", () => {
    expect(normalizeLocale("pt")).toBeNull();
    expect(normalizeLocale("it")).toBeNull();
  });
});

describe("resolveExplicitLocale", () => {
  it("prefers the signed-in user locale over device preference", () => {
    expect(
      resolveExplicitLocale({
        userPreferredLocale: "es",
        storedLocale: "en",
      })
    ).toBe("es");
  });

  it("uses the explicit device locale when no user preference exists", () => {
    expect(
      resolveExplicitLocale({
        userPreferredLocale: null,
        storedLocale: "es",
      })
    ).toBe("es");
  });

  it("falls back to English when no explicit preference exists", () => {
    expect(
      resolveExplicitLocale({
        userPreferredLocale: null,
        storedLocale: null,
      })
    ).toBe("en");
  });
});

describe("resolveRequestLocale", () => {
  it("reads the explicit device locale from the request cookie", () => {
    const request = new Request("https://rocklist.live", {
      headers: {
        cookie: "rb_locale=es",
      },
    });

    expect(
      resolveRequestLocale(request, {
        APP_URL: "https://rocklist.live",
      } as never)
    ).toBe("es");
  });

  it("still prefers the user locale over the cookie", () => {
    const request = new Request("https://rocklist.live", {
      headers: {
        cookie: "rb_locale=en",
      },
    });

    expect(
      resolveRequestLocale(
        request,
        { APP_URL: "https://rocklist.live" } as never,
        "es"
      )
    ).toBe("es");
  });

  it("falls back to English when the request cookie locale is invalid", () => {
    const request = new Request("https://rocklist.live", {
      headers: {
        cookie: "rb_locale=it",
      },
    });

    expect(
      resolveRequestLocale(request, {
        APP_URL: "https://rocklist.live",
      } as never)
    ).toBe("en");
  });

  it("uses the cookie locale when the saved user locale is invalid", () => {
    const request = new Request("https://rocklist.live", {
      headers: {
        cookie: "rb_locale=fr",
      },
    });

    expect(
      resolveRequestLocale(
        request,
        { APP_URL: "https://rocklist.live" } as never,
        "it"
      )
    ).toBe("fr");
  });
});

describe("locale cookie persistence", () => {
  it("builds a locale cookie that can be read back from a request", () => {
    const cookie = buildLocaleCookie("pt-BR", {
      APP_URL: "https://rocklist.live",
    } as never);
    const request = new Request("https://rocklist.live", {
      headers: {
        cookie,
      },
    });

    expect(cookie).toContain("rb_locale=pt-BR");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=");
    expect(cookie).toContain("Secure;");
    expect(getLocaleCookie(request)).toBe("pt-BR");
  });

  it("omits the secure flag for local development urls", () => {
    const cookie = buildLocaleCookie("es", {
      APP_URL: "http://localhost:9000",
    } as never);

    expect(cookie).not.toContain("Secure;");
  });
});
