import { describe, expect, it } from "vitest";
import {
  isTwitchHostedExtensionOrigin,
  resolveExtensionApiBaseUrl,
  toExtensionAppUrl,
} from "~/extension/panel/config";

describe("extension panel config", () => {
  it("prefers an explicit base url when one is provided", () => {
    expect(
      resolveExtensionApiBaseUrl({
        explicitBaseUrl: "https://preview.example.com/",
        envBaseUrl: "https://rocklist.live",
        windowOrigin: "https://localhost:9000",
      })
    ).toBe("https://preview.example.com");
  });

  it("uses the current page origin for local test and app-hosted panel routes", () => {
    expect(
      resolveExtensionApiBaseUrl({
        envBaseUrl: "https://rocklist.live",
        windowOrigin: "https://localhost:9000",
      })
    ).toBe("https://localhost:9000");
  });

  it("uses the configured app origin when the panel is running from Twitch hosted origins", () => {
    expect(
      resolveExtensionApiBaseUrl({
        envBaseUrl: "https://rocklist.live",
        windowOrigin: "https://abcdef.ext-twitch.tv",
      })
    ).toBe("https://rocklist.live");
  });

  it("recognizes Twitch hosted extension origins", () => {
    expect(
      isTwitchHostedExtensionOrigin("https://extension-files.twitch.tv")
    ).toBe(true);
    expect(isTwitchHostedExtensionOrigin("https://abcdef.ext-twitch.tv")).toBe(
      true
    );
    expect(isTwitchHostedExtensionOrigin("https://rocklist.live")).toBe(false);
  });

  it("builds public app urls from the resolved base url", () => {
    expect(toExtensionAppUrl("/streamer", "https://rocklist.live/")).toBe(
      "https://rocklist.live/streamer"
    );
  });
});
