"use client";

import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useLocaleTranslation } from "~/lib/i18n/client";

export type BlacklistedArtistItem = {
  artistId: number;
  artistName: string;
};

export type BlacklistedSongItem = {
  songId: number;
  songTitle: string;
  artistName?: string | null;
};

export type BlacklistedSongGroupItem = {
  groupedProjectId: number;
  songTitle: string;
  artistName?: string | null;
};

export type BlacklistedCharterItem = {
  charterId: number;
  charterName: string;
};

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

export function BlacklistPanel(props: {
  title?: string;
  description?: string;
  artists: BlacklistedArtistItem[];
  charters?: BlacklistedCharterItem[];
  songs: BlacklistedSongItem[];
  songGroups?: BlacklistedSongGroupItem[];
  showCharters?: boolean;
  showVersions?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const { t } = useLocaleTranslation("playlist");
  const showCharters = props.showCharters !== false;
  const showVersions = props.showVersions !== false;
  const sortedArtists = [...props.artists].sort((left, right) =>
    compareText(left.artistName, right.artistName)
  );
  const sortedSongGroups = [...(props.songGroups ?? [])].sort((left, right) =>
    compareText(
      left.artistName
        ? `${left.songTitle} - ${left.artistName}`
        : left.songTitle,
      right.artistName
        ? `${right.songTitle} - ${right.artistName}`
        : right.songTitle
    )
  );
  const sortedSongs = [...props.songs].sort((left, right) =>
    compareText(
      left.artistName
        ? `${left.songTitle} - ${left.artistName}`
        : left.songTitle,
      right.artistName
        ? `${right.songTitle} - ${right.artistName}`
        : right.songTitle
    )
  );
  const sortedCharters = [...(props.charters ?? [])].sort((left, right) =>
    compareText(left.charterName, right.charterName)
  );
  const content = (
    <CardContent className="grid items-start gap-6 lg:grid-cols-2">
      <div className="grid content-start gap-3 self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
          {t("rules.blacklistedArtists")}
        </p>
        {sortedArtists.length > 0 ? (
          <div className="overflow-hidden border border-(--border)">
            {sortedArtists.map((artist, index) => (
              <div
                key={artist.artistId}
                className={`px-4 py-2.5 text-sm ${
                  index % 2 === 0 ? "bg-(--panel-soft)" : "bg-(--panel-muted)"
                }`}
              >
                <p className="truncate text-(--text)">
                  {artist.artistName} ({artist.artistId})
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-(--muted)">
            {t("rules.noBlacklistedArtists")}
          </p>
        )}
      </div>

      <div className="grid content-start gap-3 self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
          {t("rules.blacklistedSongs")}
        </p>
        {sortedSongGroups.length > 0 ? (
          <div className="overflow-hidden border border-(--border)">
            {sortedSongGroups.map((song, index) => (
              <div
                key={song.groupedProjectId}
                className={`px-4 py-2.5 text-sm ${
                  index % 2 === 0 ? "bg-(--panel-soft)" : "bg-(--panel-muted)"
                }`}
              >
                <p className="truncate text-(--text)">
                  {song.artistName
                    ? `${song.songTitle} - ${song.artistName}`
                    : song.songTitle}{" "}
                  ({song.groupedProjectId})
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-(--muted)">
            {t("rules.noBlacklistedSongs")}
          </p>
        )}
      </div>

      {showVersions ? (
        <div className="grid content-start gap-3 self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
            {t("rules.blacklistedVersions")}
          </p>
          {sortedSongs.length > 0 ? (
            <div className="overflow-hidden border border-(--border)">
              {sortedSongs.map((song, index) => (
                <div
                  key={song.songId}
                  className={`px-4 py-2.5 text-sm ${
                    index % 2 === 0 ? "bg-(--panel-soft)" : "bg-(--panel-muted)"
                  }`}
                >
                  <p className="truncate text-(--text)">
                    {song.artistName
                      ? `${song.songTitle} - ${song.artistName}`
                      : song.songTitle}{" "}
                    ({song.songId})
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-(--muted)">
              {t("rules.noBlacklistedVersions")}
            </p>
          )}
        </div>
      ) : null}

      {showCharters ? (
        <div className="grid content-start gap-3 self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
            {t("rules.blacklistedCharters")}
          </p>
          {sortedCharters.length > 0 ? (
            <div className="overflow-hidden border border-(--border)">
              {sortedCharters.map((charter, index) => (
                <div
                  key={charter.charterId}
                  className={`px-4 py-2.5 text-sm ${
                    index % 2 === 0 ? "bg-(--panel-soft)" : "bg-(--panel-muted)"
                  }`}
                >
                  <p className="truncate text-(--text)">
                    {charter.charterName} ({charter.charterId})
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-(--muted)">
              {t("rules.noBlacklistedCharters")}
            </p>
          )}
        </div>
      ) : null}
    </CardContent>
  );

  if (props.collapsible) {
    return (
      <Card>
        <details
          {...(props.defaultOpen ? { open: true } : {})}
          className="group"
        >
          <summary className="cursor-pointer list-none p-6 [&::-webkit-details-marker]:hidden">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle>
                  {props.title ?? t("management.blacklistPanelTitle")}
                </CardTitle>
                {props.description ? (
                  <p className="mt-2 text-sm text-(--muted)">
                    {props.description}
                  </p>
                ) : null}
              </div>
              <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-(--muted) transition-transform group-open:rotate-180" />
            </div>
          </summary>
          {content}
        </details>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {props.title ?? t("management.blacklistPanelTitle")}
        </CardTitle>
        {props.description ? (
          <p className="text-sm text-(--muted)">{props.description}</p>
        ) : null}
      </CardHeader>
      {content}
    </Card>
  );
}
