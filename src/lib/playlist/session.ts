export type SessionPlayedSong = {
  playedAt?: number | null;
  createdAt?: number | null;
};

function getSessionPlayedSongTimestamp(song: SessionPlayedSong) {
  return song.playedAt ?? song.createdAt ?? 0;
}

export function filterPlayedSongsSinceReset<TSong extends SessionPlayedSong>(
  songs: TSong[],
  resetAt?: number | null
) {
  if (resetAt == null) {
    return songs;
  }

  return songs.filter((song) => getSessionPlayedSongTimestamp(song) > resetAt);
}
