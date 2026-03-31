import { describe, expect, it } from "vitest";
import { searchInputSchema } from "~/lib/validation";

describe("searchInputSchema", () => {
  it("allows path-only filtered browsing without a text query", () => {
    const parsed = searchInputSchema.safeParse({
      field: "any",
      parts: ["lead"],
      partsMatchMode: "any",
      page: 1,
      pageSize: 20,
    });

    expect(parsed.success).toBe(true);
  });

  it("still requires typed queries to be at least 3 characters", () => {
    const parsed = searchInputSchema.safeParse({
      query: "ab",
      field: "any",
      page: 1,
      pageSize: 20,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "Search terms must be at least 3 characters."
    );
  });
});
