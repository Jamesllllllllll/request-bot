import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import { PickOrderBadge } from "~/components/pick-order-badge";
import { decodeHtmlEntities, hexToRgba } from "~/lib/utils";

export type StreamOverlayItem = {
  id: string;
  songTitle: string;
  songArtist?: string | null;
  songAlbum?: string | null;
  songCreator?: string | null;
  songTuning?: string | null;
  songDurationText?: string | null;
  requestedByTwitchUserId?: string | null;
  requestedByDisplayName?: string | null;
  requestedByLogin?: string | null;
  requestKind?: "regular" | "vip";
  pickNumber?: number | null;
  status: string;
  createdAt?: number | null;
};

export type StreamOverlayTheme = {
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

export function StreamOverlay(props: {
  channelName: string;
  items: StreamOverlayItem[];
  theme: StreamOverlayTheme;
  showPickOrderBadges?: boolean;
  preview?: boolean;
}) {
  const maxVisibleItems = 5;
  const visibleItems = props.items.slice(0, maxVisibleItems);
  const hasOverflow = props.items.length > visibleItems.length;
  const backgroundColor = hexToRgba(
    props.theme.overlayBackgroundColor,
    props.theme.overlayBackgroundOpacity
  );
  const overlaySurfaceClassName = props.preview
    ? "min-h-[520px] w-full"
    : "min-h-screen w-full";

  const style = {
    "--overlay-bg": backgroundColor,
    "--overlay-panel": props.theme.overlayPanelColor,
    "--overlay-border": props.theme.overlayBorderColor,
    "--overlay-accent": props.theme.overlayAccentColor,
    "--overlay-vip": props.theme.overlayVipColor,
    "--overlay-text": props.theme.overlayTextColor,
    "--overlay-muted": props.theme.overlayMutedTextColor,
    "--overlay-radius": `${props.theme.overlayCornerRadius}px`,
    "--overlay-gap": `${props.theme.overlayItemGap}px`,
    "--overlay-padding": `${props.theme.overlayItemPadding}px`,
    "--overlay-title-size": `${props.theme.overlayTitleFontSize}px`,
    "--overlay-meta-size": `${props.theme.overlayMetaFontSize}px`,
  } as CSSProperties;

  return (
    <div
      className={overlaySurfaceClassName}
      style={{
        background: backgroundColor,
      }}
    >
      <div className="mx-auto flex max-w-[720px] flex-col p-4" style={style}>
        <div className="px-1 pb-3">
          <p className="text-lg font-semibold text-(--overlay-text)">
            {props.channelName}
          </p>
        </div>
        <div
          className="grid"
          style={{
            marginTop: "var(--overlay-gap)",
            gap: "var(--overlay-gap)",
          }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {visibleItems.length
              ? visibleItems.map((item, index) => (
                  <OverlayCard
                    key={item.id}
                    item={item}
                    theme={props.theme}
                    transparentBackground={
                      props.theme.overlayBackgroundOpacity === 0
                    }
                    showPickOrderBadges={!!props.showPickOrderBadges}
                    animateRecord={
                      props.theme.overlayAnimateNowPlaying &&
                      item.status === "current"
                    }
                    fadeOut={hasOverflow && index === visibleItems.length - 1}
                  />
                ))
              : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function OverlayCard(props: {
  item: StreamOverlayItem;
  theme: StreamOverlayTheme;
  transparentBackground: boolean;
  showPickOrderBadges: boolean;
  animateRecord: boolean;
  fadeOut?: boolean;
}) {
  const isVip = props.item.requestKind === "vip";
  const showStatusBadge = props.item.status === "current" || isVip;
  const requesterName =
    props.item.requestedByDisplayName ??
    props.item.requestedByLogin ??
    "viewer";
  const titleLine = [
    decodeHtmlEntities(props.item.songTitle),
    decodeHtmlEntities(props.item.songArtist),
  ]
    .filter(Boolean)
    .join(" - ");
  const detailLines = [
    props.theme.overlayShowAlbum
      ? decodeHtmlEntities(props.item.songAlbum)
      : null,
    props.theme.overlayShowCreator
      ? decodeHtmlEntities(props.item.songCreator)
      : null,
  ].filter((value): value is string => !!value);

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-(--overlay-radius) border"
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.985 }}
      transition={{
        duration: 0.28,
        ease: [0.2, 0, 0, 1],
      }}
      style={{
        borderColor: "var(--overlay-border)",
        background: "var(--overlay-panel)",
        boxShadow: "0 10px 28px rgba(0, 0, 0, 0.2)",
        paddingInline: "max(0px, calc(var(--overlay-padding) - 4px))",
        paddingBlock: "max(0px, calc(var(--overlay-padding) - 6px))",
      }}
    >
      {props.fadeOut && !props.transparentBackground ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.92))",
          }}
        />
      ) : null}
      <div className="flex items-center gap-4">
        {showStatusBadge ? (
          <StatusBadge
            animate={props.animateRecord}
            vip={isVip}
            playing={props.item.status === "current"}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-semibold leading-tight text-(--overlay-text)"
            style={{
              fontSize: "var(--overlay-title-size)",
            }}
          >
            {titleLine}
          </p>
          {detailLines.length === 0 ? (
            <p
              className="mt-1 truncate font-medium text-(--overlay-muted)"
              style={{ fontSize: "calc(var(--overlay-meta-size) + 2px)" }}
            >
              {requesterName}
            </p>
          ) : (
            <>
              <p
                className="mt-1 truncate font-medium text-(--overlay-muted)"
                style={{ fontSize: "calc(var(--overlay-meta-size) + 2px)" }}
              >
                {detailLines[0]}
              </p>
              {detailLines.slice(1).map((detailLine) => (
                <p
                  key={detailLine}
                  className="mt-1 truncate text-(--overlay-muted)"
                  style={{ fontSize: "var(--overlay-meta-size)" }}
                >
                  {detailLine}
                </p>
              ))}
              <p
                className="mt-1 truncate text-(--overlay-muted)"
                style={{ fontSize: "var(--overlay-meta-size)" }}
              >
                {requesterName}
              </p>
            </>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.showPickOrderBadges && props.item.pickNumber != null ? (
              <PickOrderBadge
                pickNumber={props.item.pickNumber}
                variant="overlay"
              />
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatusBadge(props: {
  animate: boolean;
  vip: boolean;
  playing: boolean;
}) {
  return (
    <div className="flex w-[72px] shrink-0 flex-col items-center justify-center gap-2">
      {props.playing ? (
        <RecordBadge
          animate={props.animate || props.playing}
          playing={props.playing}
        />
      ) : null}
      {props.vip ? <VipTag /> : null}
    </div>
  );
}

function RecordBadge(props: { animate: boolean; playing: boolean }) {
  return (
    <div
      className={`flex h-16 w-16 items-center justify-center ${props.animate ? "animate-[spin_3.2s_linear_infinite]" : ""}`}
      title={props.playing ? "Now playing" : "Queued"}
      style={{
        color: props.playing
          ? "var(--overlay-accent)"
          : "var(--overlay-border)",
        filter: props.playing
          ? "drop-shadow(0 0 20px rgba(255, 255, 255, 0.14))"
          : "none",
      }}
    >
      <svg
        viewBox="0 0 48 48"
        className="h-full w-full"
        aria-hidden="true"
        role="img"
        fill="none"
      >
        <path
          d="M24,2.5A21.5,21.5,0,1,0,45.5,24,21.51,21.51,0,0,0,24,2.5ZM24,8A16.06,16.06,0,0,0,8,24H8M24,13.62A10.38,10.38,0,0,0,13.62,24h0M24,17.86A6.14,6.14,0,1,1,17.86,24,6.14,6.14,0,0,1,24,17.86Zm0,16.52A10.38,10.38,0,0,0,34.38,24h0M24,40.05a16.06,16.06,0,0,0,16-16h0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function VipTag() {
  return (
    <div
      className="inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white"
      style={{
        background: "var(--overlay-vip)",
        borderColor: "rgba(255,255,255,0.16)",
        boxShadow: "0 8px 18px rgba(0, 0, 0, 0.24)",
      }}
    >
      VIP
    </div>
  );
}
