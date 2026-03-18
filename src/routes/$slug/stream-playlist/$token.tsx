// Route: Renders the tokenized stream overlay playlist for a single channel.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  StreamOverlay,
  type StreamOverlayItem,
  type StreamOverlayTheme,
} from "~/components/stream-overlay";
import { formatSlugTitle, pageTitle } from "~/lib/page-title";
import { hexToRgba } from "~/lib/utils";

type OverlayPageData = {
  channel: {
    id: string;
    slug: string;
    displayName: string;
  };
  settings: StreamOverlayTheme & {};
  items: StreamOverlayItem[];
};

export const Route = createFileRoute("/$slug/stream-playlist/$token")({
  head: ({ params }) => ({
    meta: [{ title: pageTitle(`${formatSlugTitle(params.slug)} Overlay`) }],
  }),
  component: StreamPlaylistOverlayPage,
});

function StreamPlaylistOverlayPage() {
  const { slug, token } = Route.useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<OverlayPageData>({
    queryKey: ["stream-overlay", slug, token],
    queryFn: async () => {
      const response = await fetch(`/api/overlay/${slug}/${token}`);
      if (!response.ok) {
        throw new Error("Overlay not found.");
      }

      return response.json() as Promise<OverlayPageData>;
    },
    refetchOnWindowFocus: false,
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const root = document.documentElement;
    const previousBodyBackground = document.body.style.background;
    const previousBodyMargin = document.body.style.margin;
    const previousRootBackground = root.style.background;
    root.classList.add("overlay-mode");
    document.body.classList.add("overlay-mode");
    document.body.style.margin = "0";

    if (data?.settings) {
      const background = hexToRgba(
        data.settings.overlayBackgroundColor,
        data.settings.overlayBackgroundOpacity
      );

      root.style.background = background;
      document.body.style.background = background;
    }

    return () => {
      root.classList.remove("overlay-mode");
      document.body.classList.remove("overlay-mode");
      root.style.background = previousRootBackground;
      document.body.style.background = previousBodyBackground;
      document.body.style.margin = previousBodyMargin;
    };
  }, [data?.settings]);

  useEffect(() => {
    const source = new EventSource(`/api/overlay/${slug}/${token}/stream`);

    source.addEventListener("playlist", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        items: StreamOverlayItem[];
        playedSongs?: Array<{
          requestedByTwitchUserId?: string | null;
          requestedByLogin?: string | null;
        }>;
      };

      const playedCounts = new Map<string, number>();
      for (const row of payload.playedSongs ?? []) {
        const key = row.requestedByTwitchUserId || row.requestedByLogin || "";
        if (!key) {
          continue;
        }
        playedCounts.set(key, (playedCounts.get(key) ?? 0) + 1);
      }

      const queuedCounts = new Map<string, number>();
      const items = payload.items.map((item) => {
        const key = item.requestedByTwitchUserId || item.requestedByLogin || "";
        const priorPlayed = key ? (playedCounts.get(key) ?? 0) : 0;
        const earlierQueued = key ? (queuedCounts.get(key) ?? 0) : 0;
        const pickNumber = key ? priorPlayed + earlierQueued + 1 : null;

        if (key) {
          queuedCounts.set(key, earlierQueued + 1);
        }

        return {
          ...item,
          pickNumber,
        };
      });

      queryClient.setQueryData(
        ["stream-overlay", slug, token],
        (current: OverlayPageData | undefined) =>
          current
            ? {
                ...current,
                items,
              }
            : current
      );
    });

    return () => {
      source.close();
    };
  }, [queryClient, slug, token]);

  if (isLoading) {
    return <div className="min-h-screen bg-transparent" />;
  }

  if (error || !data) {
    return <div className="min-h-screen bg-transparent" />;
  }

  return (
    <div className="min-h-screen w-full bg-transparent">
      <StreamOverlay
        channelName={`${data.channel.displayName}'s Playlist`}
        items={data.items}
        theme={data.settings}
      />
    </div>
  );
}
