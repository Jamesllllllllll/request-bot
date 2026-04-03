import { describe, expect, it } from "vitest";
import { toPublicOverlaySettings } from "~/lib/overlay/public-settings";

describe("toPublicOverlaySettings", () => {
  it("returns only overlay-safe public settings", () => {
    const result = toPublicOverlaySettings({
      showPickOrderBadges: true,
      overlayShowCreator: true,
      overlayShowAlbum: false,
      overlayAnimateNowPlaying: true,
      overlayAccentColor: "#ffffff",
      overlayVipColor: "#ff0000",
      overlayTextColor: "#111111",
      overlayMutedTextColor: "#222222",
      overlayPanelColor: "#333333",
      overlayBackgroundColor: "#444444",
      overlayBorderColor: "#555555",
      overlayBackgroundOpacity: 0.6,
      overlayCornerRadius: 14,
      overlayItemGap: 12,
      overlayItemPadding: 18,
      overlayTitleFontSize: 28,
      overlayMetaFontSize: 18,
      overlayAccessToken: "overlay-secret",
      streamElementsTipWebhookToken: "streamelements-secret",
    });

    expect(result).toEqual({
      showPickOrderBadges: true,
      overlayShowCreator: true,
      overlayShowAlbum: false,
      overlayAnimateNowPlaying: true,
      overlayAccentColor: "#ffffff",
      overlayVipColor: "#ff0000",
      overlayTextColor: "#111111",
      overlayMutedTextColor: "#222222",
      overlayPanelColor: "#333333",
      overlayBackgroundColor: "#444444",
      overlayBorderColor: "#555555",
      overlayBackgroundOpacity: 0.6,
      overlayCornerRadius: 14,
      overlayItemGap: 12,
      overlayItemPadding: 18,
      overlayTitleFontSize: 28,
      overlayMetaFontSize: 18,
    });
    expect(result).not.toHaveProperty("overlayAccessToken");
    expect(result).not.toHaveProperty("streamElementsTipWebhookToken");
  });
});
