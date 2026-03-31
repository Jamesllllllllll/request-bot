import { describe, expect, it } from "vitest";
import { getSentryOptions } from "~/lib/sentry";

describe("getSentryOptions", () => {
  it("disables Sentry in development even when a DSN is present", () => {
    expect(
      getSentryOptions({
        SENTRY_DSN: "https://examplePublicKey@example.ingest.sentry.io/123",
        SENTRY_ENVIRONMENT: "development",
      })
    ).toBeUndefined();
  });

  it("enables Sentry outside development when a DSN is present", () => {
    expect(
      getSentryOptions({
        SENTRY_DSN: "https://examplePublicKey@example.ingest.sentry.io/123",
        SENTRY_ENVIRONMENT: "production",
      })
    ).toMatchObject({
      dsn: "https://examplePublicKey@example.ingest.sentry.io/123",
      environment: "production",
    });
  });
});
