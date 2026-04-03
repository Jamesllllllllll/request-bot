import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  StreamOverlay,
  type StreamOverlayTheme,
} from "~/components/stream-overlay";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { useLocaleTranslation } from "~/lib/i18n/client";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
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
  showPickOrderBadges?: boolean;
};

type ChannelPlaylistPreviewResponse = {
  items?: PlaylistData["items"];
  playedSongs?: Array<{
    requestedByTwitchUserId?: string | null;
    requestedByLogin?: string | null;
    requestedAt?: number | null;
    playedAt?: number | null;
    createdAt?: number | null;
  }>;
  settings?: {
    showPickOrderBadges?: boolean;
  };
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
  const { t } = useLocaleTranslation("dashboard");
  const queryClient = useQueryClient();
  const cachedOverlayData = queryClient.getQueryData<OverlaySettingsResponse>([
    "dashboard-overlay",
  ]);
  const [form, setForm] = useState<OverlaySettingsInputData>(
    () => cachedOverlayData?.settings ?? defaultOverlayForm
  );
  const [hasHydratedForm, setHasHydratedForm] = useState(
    () => cachedOverlayData !== undefined
  );
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
            ? (body.message ?? t("overlay.states.failedToLoad"))
            : t("overlay.states.failedToLoad")
        );
      }

      return body as OverlaySettingsResponse;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
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
        throw new Error(t("overlay.states.failedPreview"));
      }

      const items = body?.items ?? [];
      const pickNumbers = getPickNumbersForQueuedItems(
        items,
        body?.playedSongs ?? []
      );

      return {
        items: items.map((item, index) => ({
          ...item,
          pickNumber: pickNumbers[index] ?? null,
        })),
        showPickOrderBadges: !!body?.settings?.showPickOrderBadges,
      } satisfies PlaylistData;
    },
    enabled: !!overlayQuery.data?.channel.slug,
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (hasHydratedForm || overlayQuery.data === undefined) {
      return;
    }

    if (overlayQuery.data.settings) {
      setForm(overlayQuery.data.settings);
    }

    setHasHydratedForm(true);
  }, [hasHydratedForm, overlayQuery.data]);

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
        throw new Error(body?.message ?? t("overlay.states.failedToSave"));
      }

      return body;
    },
    onMutate: () => {
      setMessage(null);
      setErrorMessage(null);
    },
    onSuccess: async (payload) => {
      setMessage(payload?.message ?? t("overlay.states.saved"));
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
  const channelName =
    overlayQuery.data?.channel.displayName ?? t("overlay.channelFallback");
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
    setMessage(t("overlay.states.copied"));
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
    <Card id="overlay" className="dashboard-overlay__section">
      <CardHeader>
        <CardTitle>{t("overlay.title")}</CardTitle>
        <CardDescription>{t("overlay.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {message ? <Banner tone="success">{message}</Banner> : null}
        {errorMessage ? <Banner tone="danger">{errorMessage}</Banner> : null}
        {overlayQuery.error ? (
          <Banner tone="danger">{getErrorMessage(overlayQuery.error)}</Banner>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="grid gap-6">
            <Card className="dashboard-overlay__section">
              <CardHeader>
                <CardTitle>{t("overlay.url.title")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Input value={overlayUrl} readOnly />
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={copyOverlayUrl}
                    disabled={!overlayUrl}
                  >
                    <Copy className="h-4 w-4" />
                    {t("overlay.url.copy")}
                  </Button>
                  {overlayUrl ? (
                    <Button asChild variant="outline">
                      <a href={overlayUrl} target="_blank" rel="noreferrer">
                        {t("overlay.url.open")}
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-overlay__section">
              <CardHeader>
                <CardTitle>{t("overlay.layout.title")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden border border-(--border) p-0">
                <ToggleRow
                  label={t("overlay.layout.showCreator")}
                  checked={form.overlayShowCreator}
                  onChange={(value) => setBoolean("overlayShowCreator", value)}
                />
                <ToggleRow
                  label={t("overlay.layout.showAlbum")}
                  checked={form.overlayShowAlbum}
                  onChange={(value) => setBoolean("overlayShowAlbum", value)}
                />
                <ToggleRow
                  label={t("overlay.layout.animateNowPlaying")}
                  checked={form.overlayAnimateNowPlaying}
                  onChange={(value) =>
                    setBoolean("overlayAnimateNowPlaying", value)
                  }
                />
              </CardContent>
            </Card>

            <Card className="dashboard-overlay__section">
              <CardHeader>
                <CardTitle>{t("overlay.theme.title")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden border border-(--border) p-0">
                <ColorField
                  label={t("overlay.theme.accent")}
                  value={form.overlayAccentColor}
                  onChange={(value) => setColor("overlayAccentColor", value)}
                />
                <ColorField
                  label={t("overlay.theme.vipBadge")}
                  value={form.overlayVipColor}
                  onChange={(value) => setColor("overlayVipColor", value)}
                />
                <ColorField
                  label={t("overlay.theme.text")}
                  value={form.overlayTextColor}
                  onChange={(value) => setColor("overlayTextColor", value)}
                />
                <ColorField
                  label={t("overlay.theme.mutedText")}
                  value={form.overlayMutedTextColor}
                  onChange={(value) => setColor("overlayMutedTextColor", value)}
                />
                <ColorField
                  label={t("overlay.theme.requestBackground")}
                  value={form.overlayPanelColor}
                  onChange={(value) => setColor("overlayPanelColor", value)}
                />
                <ColorField
                  label={t("overlay.theme.backgroundColor")}
                  description={t("overlay.theme.backgroundColorHelp")}
                  value={form.overlayBackgroundColor}
                  onChange={(value) =>
                    setColor("overlayBackgroundColor", value)
                  }
                />
                <ColorField
                  label={t("overlay.theme.border")}
                  value={form.overlayBorderColor}
                  onChange={(value) => setColor("overlayBorderColor", value)}
                />
              </CardContent>
            </Card>

            <Card className="dashboard-overlay__section">
              <CardHeader>
                <CardTitle>{t("overlay.sizing.title")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden border border-(--border) p-0">
                <RangeField
                  label={t("overlay.sizing.backgroundOpacity")}
                  description={t("overlay.sizing.backgroundOpacityHelp")}
                  min={0}
                  max={100}
                  value={form.overlayBackgroundOpacity}
                  onChange={(value) =>
                    setNumber("overlayBackgroundOpacity", value)
                  }
                />
                <RangeField
                  label={t("overlay.sizing.cornerRadius")}
                  min={0}
                  max={40}
                  value={form.overlayCornerRadius}
                  onChange={(value) => setNumber("overlayCornerRadius", value)}
                />
                <RangeField
                  label={t("overlay.sizing.itemGap")}
                  min={0}
                  max={32}
                  value={form.overlayItemGap}
                  onChange={(value) => setNumber("overlayItemGap", value)}
                />
                <RangeField
                  label={t("overlay.sizing.itemPadding")}
                  min={8}
                  max={32}
                  value={form.overlayItemPadding}
                  onChange={(value) => setNumber("overlayItemPadding", value)}
                />
                <RangeField
                  label={t("overlay.sizing.titleFontSize")}
                  min={16}
                  max={48}
                  value={form.overlayTitleFontSize}
                  onChange={(value) => setNumber("overlayTitleFontSize", value)}
                />
                <RangeField
                  label={t("overlay.sizing.metaFontSize")}
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
                {t("overlay.actions.restoreDefaults")}
              </Button>
            </div>
          </div>

          <div className="self-start xl:sticky xl:top-6">
            <Card className="dashboard-overlay__section overflow-hidden">
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{t("overlay.preview.title")}</CardTitle>
                  <Button
                    variant={hasUnsavedChanges ? "default" : "outline"}
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !hasUnsavedChanges}
                  >
                    {saveMutation.isPending
                      ? t("overlay.actions.saving")
                      : t("overlay.actions.saveChanges")}
                  </Button>
                  <div className="inline-flex border border-(--border) bg-(--panel-soft) p-1">
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-sm transition-colors ${
                        previewMode === "live"
                          ? "bg-(--brand) text-white"
                          : "text-(--muted)"
                      }`}
                      onClick={() => {
                        setPreviewMode("live");
                        setPreviewModeTouched(true);
                      }}
                    >
                      {t("overlay.preview.live")}
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-sm transition-colors ${
                        previewMode === "sample"
                          ? "bg-(--brand) text-white"
                          : "text-(--muted)"
                      }`}
                      onClick={() => {
                        setPreviewMode("sample");
                        setPreviewModeTouched(true);
                      }}
                    >
                      {t("overlay.preview.sample")}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  className="border border-(--border) p-6"
                  style={{
                    background:
                      form.overlayBackgroundOpacity > 0
                        ? previewBackground
                        : "repeating-conic-gradient(from 45deg, rgba(255,255,255,0.06) 0% 25%, rgba(255,255,255,0.015) 0% 50%) 50% / 20px 20px",
                  }}
                >
                  <div className="overflow-hidden">
                    <StreamOverlay
                      preview
                      channelName={t("overlay.preview.channelTitle", {
                        channel: channelName,
                      })}
                      items={previewItems}
                      theme={previewTheme}
                      showPickOrderBadges={
                        playlistQuery.data?.showPickOrderBadges ?? false
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>

      {showRestoreDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md border border-(--border-strong) bg-(--panel-strong) p-6 shadow-(--shadow)">
            <h2 className="text-2xl font-semibold text-(--text)">
              {t("overlay.restoreDialog.title")}
            </h2>
            <p className="mt-3 text-sm leading-7 text-(--muted)">
              {t("overlay.restoreDialog.description")}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowRestoreDialog(false)}
              >
                {t("overlay.actions.cancel")}
              </Button>
              <Button variant="default" onClick={restoreDefaults}>
                {t("overlay.restoreDialog.confirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function ToggleRow(props: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const inputId = useId();

  return (
    <div className="grid gap-2 px-4 py-3 odd:bg-(--panel-soft) even:bg-(--panel-muted)">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={inputId} className="font-medium text-(--text)">
          {props.label}
        </label>
        <Checkbox
          id={inputId}
          checked={props.checked}
          onCheckedChange={(checked) => props.onChange(checked === true)}
        />
      </div>
      {props.description ? (
        <p className="text-sm leading-6 text-(--muted)">{props.description}</p>
      ) : null}
    </div>
  );
}

function ColorField(props: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 px-4 py-3 odd:bg-(--panel-soft) even:bg-(--panel-muted)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-(--text)">{props.label}</p>
        <div className="flex min-w-0 items-center gap-3 sm:w-auto">
          <input
            type="color"
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            className="h-10 w-12 shrink-0 border border-(--border) bg-transparent"
          />
          <div className="w-full sm:w-44">
            <Input
              value={props.value}
              onChange={(event) => props.onChange(event.target.value)}
            />
          </div>
        </div>
      </div>
      {props.description ? (
        <p className="text-sm leading-6 text-(--muted)">{props.description}</p>
      ) : null}
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
  const { t } = useLocaleTranslation("dashboard");

  return (
    <div className="grid gap-2 px-4 py-3 odd:bg-(--panel-soft) even:bg-(--panel-muted)">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-(--text)">{props.label}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
            {t("overlay.sizing.value")}
          </span>
          <span className="text-sm text-(--text)">{props.value}</span>
        </div>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      {props.description ? (
        <p className="text-sm leading-6 text-(--muted)">{props.description}</p>
      ) : null}
    </div>
  );
}

function Banner(props: { tone: "success" | "danger"; children: string }) {
  const classes =
    props.tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-rose-500/30 bg-rose-500/10 text-rose-200";

  return (
    <div className={`border p-4 text-sm ${classes}`}>{props.children}</div>
  );
}
