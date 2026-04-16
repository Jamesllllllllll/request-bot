import { describe, expect, it } from "vitest";
import {
  extensionSearchInputSchema,
  searchInputSchema,
} from "~/lib/validation";

describe("searchInputSchema", () => {
  it("rejects legacy lyrics paths", () => {
    const parsed = searchInputSchema.safeParse({
      field: "any",
      parts: ["voice"],
      page: 1,
      pageSize: 20,
    });

    expect(parsed.success).toBe(false);
  });

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

  it("rejects legacy lyrics path filters", () => {
    const parsed = searchInputSchema.safeParse({
      field: "any",
      parts: ["voice"],
      page: 1,
      pageSize: 20,
    });

    expect(parsed.success).toBe(false);
  });

  it("allows channel-scoped favorites browsing without a text query", () => {
    const parsed = searchInputSchema.safeParse({
      channelSlug: "tester",
      favoritesOnly: true,
      field: "any",
      page: 1,
      pageSize: 20,
    });

    expect(parsed.success).toBe(true);
  });

  it("allows year filters before 1900", () => {
    const parsed = searchInputSchema.safeParse({
      field: "any",
      year: [1888],
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

  it("requires a channel for favorites-only browsing", () => {
    const parsed = searchInputSchema.safeParse({
      favoritesOnly: true,
      field: "any",
      page: 1,
      pageSize: 20,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "Favorites-only search requires a channel."
    );
  });
});

describe("extensionSearchInputSchema", () => {
  it("allows advanced filter browsing without a text query", () => {
    const parsed = extensionSearchInputSchema.safeParse({
      title: "Metal",
      tuning: [1],
      year: [2014],
      page: 1,
      pageSize: 10,
    });

    expect(parsed.success).toBe(true);
  });

  it("still requires typed queries to be at least 3 characters", () => {
    const parsed = extensionSearchInputSchema.safeParse({
      query: "ab",
      page: 1,
      pageSize: 10,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "Search terms must be at least 3 characters."
    );
  });
});
