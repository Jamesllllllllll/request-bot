import { describe, expect, it } from "vitest";
import { isDuplicateConstraintError } from "~/lib/db/repositories";

describe("isDuplicateConstraintError", () => {
  it("detects a direct duplicate constraint error", () => {
    expect(
      isDuplicateConstraintError(
        new Error("UNIQUE constraint failed: table.column")
      )
    ).toBe(true);
  });

  it("detects a duplicate constraint error nested in causes", () => {
    const duplicateError = new Error(
      "D1_ERROR: UNIQUE constraint failed: eventsub_deliveries.channel_id, eventsub_deliveries.message_id: SQLITE_CONSTRAINT"
    );
    const drizzleError = new Error(
      "Failed query: insert into eventsub_deliveries"
    );
    drizzleError.cause = duplicateError;
    const outerError = new Error("Webhook handling failed");
    outerError.cause = drizzleError;

    expect(isDuplicateConstraintError(outerError)).toBe(true);
  });
});
