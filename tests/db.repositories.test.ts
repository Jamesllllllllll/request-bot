import { describe, expect, it } from "vitest";
import {
  isDuplicateConstraintError,
  resolveOwnerDashboardChannelAccess,
} from "~/lib/db/repositories";

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

describe("resolveOwnerDashboardChannelAccess", () => {
  it("returns the owned channel when no slug is requested", () => {
    expect(
      resolveOwnerDashboardChannelAccess({
        requestedSlug: null,
        requestedChannel: null,
        ownedChannel: {
          id: "chn_owner",
          ownerUserId: "usr_owner",
        },
        userId: "usr_owner",
      })
    ).toEqual({
      channel: {
        id: "chn_owner",
        ownerUserId: "usr_owner",
      },
      accessRole: "owner",
      actorUserId: "usr_owner",
    });
  });

  it("does not fall back to the owned channel when a requested slug is missing", () => {
    expect(
      resolveOwnerDashboardChannelAccess({
        requestedSlug: "missing-user",
        requestedChannel: null,
        ownedChannel: {
          id: "chn_owner",
          ownerUserId: "usr_owner",
        },
        userId: "usr_owner",
      })
    ).toBeNull();
  });

  it("allows moderator checks to continue when the requested slug belongs to another user", () => {
    expect(
      resolveOwnerDashboardChannelAccess({
        requestedSlug: "other-user",
        requestedChannel: {
          id: "chn_other",
          ownerUserId: "usr_other",
        },
        ownedChannel: {
          id: "chn_owner",
          ownerUserId: "usr_owner",
        },
        userId: "usr_owner",
      })
    ).toBeUndefined();
  });
});
