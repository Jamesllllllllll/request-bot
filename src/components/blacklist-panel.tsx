import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

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

export function BlacklistPanel(props: {
  title?: string;
  description?: string;
  artists: BlacklistedArtistItem[];
  charters?: BlacklistedCharterItem[];
  songs: BlacklistedSongItem[];
  songGroups?: BlacklistedSongGroupItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const content = (
    <CardContent className="grid items-start gap-6 lg:grid-cols-2">
      <div className="grid content-start gap-3 self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
          Artists
        </p>
        {props.artists.length > 0 ? (
          <div className="overflow-hidden rounded-[20px] border border-(--border)">
            {props.artists.map((artist, index) => (
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
          <p className="text-sm text-(--muted)">No blacklisted artists.</p>
        )}
      </div>

      <div className="grid content-start gap-3 self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
          Songs
        </p>
        {props.songGroups?.length ? (
          <div className="overflow-hidden rounded-[20px] border border-(--border)">
            {props.songGroups.map((song, index) => (
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
          <p className="text-sm text-(--muted)">No blacklisted songs.</p>
        )}
      </div>

      <div className="grid content-start gap-3 self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
          Versions
        </p>
        {props.songs.length > 0 ? (
          <div className="overflow-hidden rounded-[20px] border border-(--border)">
            {props.songs.map((song, index) => (
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
          <p className="text-sm text-(--muted)">No blacklisted versions.</p>
        )}
      </div>

      <div className="grid content-start gap-3 self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
          Charters
        </p>
        {props.charters?.length ? (
          <div className="overflow-hidden rounded-[20px] border border-(--border)">
            {props.charters.map((charter, index) => (
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
          <p className="text-sm text-(--muted)">No blacklisted charters.</p>
        )}
      </div>
    </CardContent>
  );

  if (props.collapsible) {
    return (
      <Card>
        <details
          {...(props.defaultOpen ? { open: true } : {})}
          className="group"
        >
          <summary className="cursor-pointer list-none rounded-[28px] p-6 [&::-webkit-details-marker]:hidden">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle>{props.title ?? "Channel blacklists"}</CardTitle>
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
        <CardTitle>{props.title ?? "Channel blacklists"}</CardTitle>
        {props.description ? (
          <p className="text-sm text-(--muted)">{props.description}</p>
        ) : null}
      </CardHeader>
      {content}
    </Card>
  );
}
