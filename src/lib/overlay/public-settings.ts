export type PublicOverlaySettings = {
  showPickOrderBadges: boolean;
  overlayShowTitle: boolean;
  overlayShowCreator: boolean;
  overlayShowAlbum: boolean;
  overlayAnimateNowPlaying: boolean;
  overlayAccentColor: string;
  overlayVipColor: string;
  overlayTextColor: string;
  overlayMutedTextColor: string;
  overlayPanelColor: string;
  overlayBackgroundColor: string;
  overlayBorderColor: string;
  overlayBackgroundOpacity: number;
  overlayCornerRadius: number;
  overlayItemGap: number;
  overlayItemPadding: number;
  overlayTitleFontSize: number;
  overlayMetaFontSize: number;
};

export function toPublicOverlaySettings(
  settings: PublicOverlaySettings & Record<string, unknown>
) {
  return {
    showPickOrderBadges: settings.showPickOrderBadges,
    overlayShowTitle: settings.overlayShowTitle,
    overlayShowCreator: settings.overlayShowCreator,
    overlayShowAlbum: settings.overlayShowAlbum,
    overlayAnimateNowPlaying: settings.overlayAnimateNowPlaying,
    overlayAccentColor: settings.overlayAccentColor,
    overlayVipColor: settings.overlayVipColor,
    overlayTextColor: settings.overlayTextColor,
    overlayMutedTextColor: settings.overlayMutedTextColor,
    overlayPanelColor: settings.overlayPanelColor,
    overlayBackgroundColor: settings.overlayBackgroundColor,
    overlayBorderColor: settings.overlayBorderColor,
    overlayBackgroundOpacity: settings.overlayBackgroundOpacity,
    overlayCornerRadius: settings.overlayCornerRadius,
    overlayItemGap: settings.overlayItemGap,
    overlayItemPadding: settings.overlayItemPadding,
    overlayTitleFontSize: settings.overlayTitleFontSize,
    overlayMetaFontSize: settings.overlayMetaFontSize,
  } satisfies PublicOverlaySettings;
}
