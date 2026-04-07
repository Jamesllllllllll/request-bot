import { describe, expect, it } from "vitest";
import {
  getPlaylistEndpoint,
  getPlaylistMutationEndpoint,
} from "~/lib/playlist/management-endpoints";

describe("playlist management endpoints", () => {
  it("uses the read path for playlist fetches", () => {
    expect(getPlaylistEndpoint("/api/channel/jimmy/playlist/management")).toBe(
      "/api/channel/jimmy/playlist/management"
    );
  });

  it("uses the explicit mutation path for playlist writes", () => {
    expect(
      getPlaylistMutationEndpoint(
        "/api/channel/jimmy/playlist/management",
        "/api/channel/jimmy/playlist"
      )
    ).toBe("/api/channel/jimmy/playlist");
  });

  it("preserves selected channel params on both endpoints", () => {
    expect(getPlaylistEndpoint("/api/dashboard/playlist", "jimmy-pants")).toBe(
      "/api/dashboard/playlist?channel=jimmy-pants"
    );
    expect(
      getPlaylistMutationEndpoint(
        "/api/dashboard/playlist/management",
        "/api/dashboard/playlist",
        "jimmy-pants"
      )
    ).toBe("/api/dashboard/playlist?channel=jimmy-pants");
  });
});
