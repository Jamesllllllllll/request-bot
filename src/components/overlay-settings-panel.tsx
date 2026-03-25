import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  StreamOverlay,
  type StreamOverlayTheme,
} from "~/components/stream-overlay";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { getErrorMessage, hexToRgba } from "~/lib/utils";
import type { OverlaySettingsInputData } from "~/lib/validation";

type OverlaySettingsResponse = {
  channel: {
    id: string;
    slug: string;
    displayName: string;
  };
  settings: OverlaySettingsInputData;
  overlayPath: string;
  overlayUrl: string;
};

type PlaylistData = {
  items: Array<{
    id: string;
    songTitle: string;
    songArtist?: string | null;
    songAlbum?: string | null;
    songCreator?: string | null;
    songTuning?: string | null;
    songDurationText?: string | null;
    requestKind?: "regular" | "vip";
    pickNumber?: number | null;
    requestedByDisplayName?: string | null;
    requestedByTwitchUserId?: string | null;
    requestedByLogin?: string | null;
    status: string;
  }>;
};

type ChannelPlaylistPreviewResponse = {
  items?: PlaylistData["items"];
};

const defaultOverlayForm: OverlaySettingsInputData = {
  overlayShowCreator: false,
  overlayShowAlbum: false,
  overlayAnimateNowPlaying: true,
  overlayAccentColor: "#cf7cff",
  overlayVipColor: "#a855f7",
  overlayTextColor: "#f5f7fb",
  overlayMutedTextColor: "#9aa4b2",
  overlayPanelColor: "#0f1117",
  overlayBackgroundColor: "#05070d",
  overlayBorderColor: "#2a3140",
  overlayBackgroundOpacity: 0,
  overlayCornerRadius: 22,
  overlayItemGap: 12,
  overlayItemPadding: 16,
  overlayTitleFontSize: 26,
  overlayMetaFontSize: 14,
};

export function OverlaySettingsPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] =
    useState<OverlaySettingsInputData>(defaultOverlayForm);
  const [previewMode, setPreviewMode] = useState<"live" | "sample">("live");
  const [previewModeTouched, setPreviewModeTouched] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const overlayQuery = useQuery<OverlaySettingsResponse>({
    queryKey: ["dashboard-overlay"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/overlay");
      const body = (await response.json().catch(() => null)) as
        | OverlaySettingsResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? "Failed to load overlay settings.")
            : "Failed to load overlay settings."
        );
      }

      return body as OverlaySettingsResponse;
    },
  });

  const playlistQuery = useQuery<PlaylistData>({
    queryKey: [
      "channel-overlay-playlist-preview",
      overlayQuery.data?.channel.slug,
    ],
    queryFn: async () => {
      const slug = overlayQuery.data?.channel.slug;

      if (!slug) {
        return { items: [] } satisfies PlaylistData;
      }

      const response = await fetch(`/api/channel/${slug}/playlist`);
      const body = (await response
        .json()
        .catch(() => null)) as ChannelPlaylistPreviewResponse | null;

      if (!response.ok) {
        throw new Error("Failed to load playlist preview.");
      }

      return {
        items: body?.items ?? [],
      } satisfies PlaylistData;
    },
    enabled: !!overlayQuery.data?.channel.slug,
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (overlayQuery.data?.settings) {
      setForm(overlayQuery.data.settings);
    }
  }, [overlayQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/dashboard/overlay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ settings: form }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.message ?? "Overlay settings could not be saved."
        );
      }

      return body;
    },
    onMutate: () => {
      setMessage(null);
      setErrorMessage(null);
    },
    onSuccess: async (payload) => {
      setMessage(payload?.message ?? "Overlay settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["dashboard-overlay"] });
    },
    onError: (error) => {
      setErrorMessage(getErrorMessage(error));
    },
  });

  const previewTheme = useMemo<StreamOverlayTheme>(() => form, [form]);
  const previewBackground = useMemo(
    () => hexToRgba(form.overlayBackgroundColor, form.overlayBackgroundOpacity),
    [form.overlayBackgroundColor, form.overlayBackgroundOpacity]
  );
  const savedForm = overlayQuery.data?.settings ?? defaultOverlayForm;
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(savedForm);
  const overlayUrl = overlayQuery.data?.overlayUrl ?? "";
  const channelName = overlayQuery.data?.channel.displayName ?? "Your channel";
  const liveItems = playlistQuery.data?.items ?? [];
  const sampleItems = useMemo<PlaylistData["items"]>(
    () => [
      {
        id: "sample-current",
        songTitle: "Cherub Rock",
        songArtist: "Smashing Pumpkins",
        songAlbum: "Siamese Dream",
        songCreator: "Ubisoft",
        songTuning: "E Standard",
        songDurationText: "4:58",
        requestKind: "regular",
        pickNumber: 1,
        requestedByDisplayName: "Viewer One",
        requestedByTwitchUserId: "sample-viewer-1",
        requestedByLogin: "viewer_one",
        status: "current",
      },
      {
        id: "sample-vip",
        songTitle: "Wonderwall",
        songArtist: "Oasis",
        songAlbum: "(What's the Story) Morning Glory?",
        songCreator: "Custom Charter",
        songTuning: "E Standard",
        songDurationText: "4:19",
        requestKind: "vip",
        pickNumber: 2,
        requestedByDisplayName: "VIP Viewer",
        requestedByTwitchUserId: "sample-viewer-2",
        requestedByLogin: "vip_viewer",
        status: "queued",
      },
      {
        id: "sample-third",
        songTitle: "Cellophane",
        songArtist: "King Gizzard & the Lizard Wizard",
        songAlbum: "I'm in Your Mind Fuzz",
        songCreator: "Custom Charter",
        songTuning: "C# Standard",
        songDurationText: "3:16",
        requestKind: "regular",
        pickNumber: 3,
        requestedByDisplayName: "Frequent Viewer",
        requestedByTwitchUserId: "sample-viewer-3",
        requestedByLogin: "frequent_viewer",
        status: "queued",
      },
    ],
    []
  );
  const previewItems = previewMode === "sample" ? sampleItems : liveItems;

  useEffect(() => {
    if (previewModeTouched) {
      return;
    }

    setPreviewMode(liveItems.length === 0 ? "sample" : "live");
  }, [liveItems.length, previewModeTouched]);

  async function copyOverlayUrl() {
    if (!overlayUrl) {
      return;
    }

    await navigator.clipboard.writeText(overlayUrl);
    setMessage("Overlay URL copied.");
    setErrorMessage(null);
  }

  function setBoolean<K extends keyof OverlaySettingsInputData>(
    key: K,
    value: boolean
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setNumber<K extends keyof OverlaySettingsInputData>(
    key: K,
    value: number
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setColor<K extends keyof OverlaySettingsInputData>(
    key: K,
    value: string
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function restoreDefaults() {
    setForm(defaultOverlayForm);
    setShowRestoreDialog(false);
    setMessage(null);
    setErrorMessage(null);
  }

  return (
    <section id="overlay" className="grid gap-6">
      <div className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-(--text)">
          Stream overlay
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-(--muted)">
          Keep browser-source configuration with the rest of your channel
          settings. The preview still reflects your live playlist when it is
          available.
        </p>
      </div>

      {message ? <Banner tone="success">{message}</Banner> : null}
      {errorMessage ? <Banner tone="danger">{errorMessage}</Banner> : null}
      {overlayQuery.error ? (
        <Banner tone="danger">{getErrorMessage(overlayQuery.error)}</Banner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="grid gap-6">
          <Card className="dashboard-overlay__section">
            <CardHeader>
              <CardTitle>Overlay access</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <p className="text-sm font-medium text-(--text)">Overlay URL</p>
                <Input value={overlayUrl} readOnly />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={copyOverlayUrl}
                  disabled={!overlayUrl}
                >
                  <Copy className="h-4 w-4" />
                  Copy URL
                </Button>
                {overlayUrl ? (
                  <Button asChild variant="outline">
                    <a href={overlayUrl} target="_blank" rel="noreferrer">
                      Open overlay
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="dashboard-overlay__section">
            <CardHeader>
              <CardTitle>Layout and behavior</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ToggleRow
                label="Show creator"
                description="Show creator"
                checked={form.overlayShowCreator}
                onChange={(value) => setBoolean("overlayShowCreator", value)}
              />
              <ToggleRow
                label="Show album"
                description="Show album"
                checked={form.overlayShowAlbum}
                onChange={(value) => setBoolean("overlayShowAlbum", value)}
              />
              <ToggleRow
                label="Animate now playing"
                description="Animate current song"
                checked={form.overlayAnimateNowPlaying}
                onChange={(value) =>
                  setBoolean("overlayAnimateNowPlaying", value)
                }
              />
            </CardContent>
          </Card>

          <Card className="dashboard-overlay__section">
            <CardHeader>
              <CardTitle>Theme</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ColorField
                label="Accent"
                value={form.overlayAccentColor}
                onChange={(value) => setColor("overlayAccentColor", value)}
              />
              <ColorField
                label="VIP badge"
                value={form.overlayVipColor}
                onChange={(value) => setColor("overlayVipColor", value)}
              />
              <ColorField
                label="Text"
                value={form.overlayTextColor}
                onChange={(value) => setColor("overlayTextColor", value)}
              />
              <ColorField
                label="Muted text"
                value={form.overlayMutedTextColor}
                onChange={(value) => setColor("overlayMutedTextColor", value)}
              />
              <ColorField
                label="Request item background"
                value={form.overlayPanelColor}
                onChange={(value) => setColor("overlayPanelColor", value)}
              />
              <ColorField
                label="Overlay background / chroma key"
                description="Use a normal visible background, or pick a deliberate key color like bright pink or green for OBS chroma key."
                value={form.overlayBackgroundColor}
                onChange={(value) => setColor("overlayBackgroundColor", value)}
              />
              <ColorField
                label="Border"
                value={form.overlayBorderColor}
                onChange={(value) => setColor("overlayBorderColor", value)}
              />
            </CardContent>
          </Card>

          <Card className="dashboard-overlay__section">
            <CardHeader>
              <CardTitle>Density and sizing</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <RangeField
                label="Overlay background opacity"
                description="Set this to 0 for a fully transparent page behind the playlist items."
                min={0}
                max={100}
                value={form.overlayBackgroundOpacity}
                onChange={(value) =>
                  setNumber("overlayBackgroundOpacity", value)
                }
              />
              <RangeField
                label="Corner radius"
                min={0}
                max={40}
                value={form.overlayCornerRadius}
                onChange={(value) => setNumber("overlayCornerRadius", value)}
              />
              <RangeField
                label="Item gap"
                min={0}
                max={32}
                value={form.overlayItemGap}
                onChange={(value) => setNumber("overlayItemGap", value)}
              />
              <RangeField
                label="Item padding"
                min={8}
                max={32}
                value={form.overlayItemPadding}
                onChange={(value) => setNumber("overlayItemPadding", value)}
              />
              <RangeField
                label="Title font size"
                min={16}
                max={48}
                value={form.overlayTitleFontSize}
                onChange={(value) => setNumber("overlayTitleFontSize", value)}
              />
              <RangeField
                label="Meta font size"
                min={10}
                max={24}
                value={form.overlayMetaFontSize}
                onChange={(value) => setNumber("overlayMetaFontSize", value)}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setShowRestoreDialog(true)}
            >
              Restore defaults
            </Button>
          </div>
        </div>

        <div className="self-start xl:sticky xl:top-6">
          <Card className="dashboard-overlay__section overflow-hidden">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Preview</CardTitle>
                <Button
                  variant={hasUnsavedChanges ? "default" : "outline"}
                  className={
                    hasUnsavedChanges && !saveMutation.isPending
                      ? "animate-pulse"
                      : undefined
                  }
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !hasUnsavedChanges}
                >
                  {saveMutation.isPending ? "Saving..." : "Save changes"}
                </Button>
                <div className="inline-flex rounded-full border border-(--border) bg-(--panel-soft) p-1">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                      previewMode === "live"
                        ? "bg-(--brand) text-white"
                        : "text-(--muted)"
                    }`}
                    onClick={() => {
                      setPreviewMode("live");
                      setPreviewModeTouched(true);
                    }}
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                      previewMode === "sample"
                        ? "bg-(--brand) text-white"
                        : "text-(--muted)"
                    }`}
                    onClick={() => {
                      setPreviewMode("sample");
                      setPreviewModeTouched(true);
                    }}
                  >
                    Sample
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div
                className="rounded-[28px] border border-(--border) p-6"
                style={{
                  background:
                    form.overlayBackgroundOpacity > 0
                      ? previewBackground
                      : "repeating-conic-gradient(from 45deg, rgba(255,255,255,0.06) 0% 25%, rgba(255,255,255,0.015) 0% 50%) 50% / 20px 20px",
                }}
              >
                <div className="overflow-hidden rounded-[28px]">
                  <StreamOverlay
                    preview
                    channelName={`${channelName}'s Playlist`}
                    items={previewItems}
                    theme={previewTheme}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showRestoreDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-(--border-strong) bg-(--panel-strong) p-6 shadow-(--shadow)">
            <h2 className="text-xl font-semibold text-(--text)">
              Restore defaults?
            </h2>
            <p className="mt-3 text-sm leading-7 text-(--muted)">
              This resets the overlay editor to the default theme. Unsaved
              changes will be lost.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowRestoreDialog(false)}
              >
                Cancel
              </Button>
              <Button variant="default" onClick={restoreDefaults}>
                Restore defaults
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <div>
        <p className="font-medium text-(--text)">{props.label}</p>
        <p className="mt-1 text-sm leading-7 text-(--muted)">
          {props.description}
        </p>
      </div>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="mt-1 h-5 w-5"
      />
    </label>
  );
}

function ColorField(props: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <p className="text-sm font-medium text-(--text)">{props.label}</p>
      {props.description ? (
        <p className="text-sm leading-6 text-(--muted)">{props.description}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="h-11 w-14 rounded-xl border border-(--border) bg-transparent"
        />
        <Input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function RangeField(props: {
  label: string;
  description?: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-3 rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-(--text)">{props.label}</p>
        <span className="text-sm text-(--muted)">{props.value}</span>
      </div>
      {props.description ? (
        <p className="text-sm leading-6 text-(--muted)">{props.description}</p>
      ) : null}
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}

function Banner(props: { tone: "success" | "danger"; children: string }) {
  const classes =
    props.tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-rose-500/30 bg-rose-500/10 text-rose-200";

  return (
    <div className={`rounded-[24px] border p-4 text-sm ${classes}`}>
      {props.children}
    </div>
  );
}
