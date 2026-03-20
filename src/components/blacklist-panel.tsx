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

export function BlacklistPanel(props: {
  title?: string;
  description?: string;
  artists: BlacklistedArtistItem[];
  songs: BlacklistedSongItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title ?? "Blacklisted songs and artists"}</CardTitle>
        {props.description ? (
          <p className="text-sm text-(--muted)">{props.description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="grid gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Artists
          </p>
          {props.artists.length > 0 ? (
            props.artists.map((artist) => (
              <div
                key={artist.artistId}
                className="rounded-[20px] border border-(--border) bg-(--panel-soft) px-4 py-3"
              >
                <p className="font-medium text-(--text)">{artist.artistName}</p>
                <p className="mt-1 text-xs text-(--muted)">
                  Artist ID {artist.artistId}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-(--muted)">No blacklisted artists.</p>
          )}
        </div>

        <div className="grid gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
            Songs
          </p>
          {props.songs.length > 0 ? (
            props.songs.map((song) => (
              <div
                key={song.songId}
                className="rounded-[20px] border border-(--border) bg-(--panel-soft) px-4 py-3"
              >
                <p className="font-medium text-(--text)">
                  {song.songTitle}
                  {song.artistName ? ` - ${song.artistName}` : ""}
                </p>
                <p className="mt-1 text-xs text-(--muted)">
                  Song ID {song.songId}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-(--muted)">No blacklisted songs.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
