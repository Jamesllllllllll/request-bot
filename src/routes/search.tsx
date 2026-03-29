// Route: Renders the public song search experience and advanced search filters.
import { createFileRoute } from "@tanstack/react-router";
import { SongSearchPanel } from "~/components/song-search-panel";
import { pageTitle } from "~/lib/page-title";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [{ title: pageTitle("Search Songs") }],
  }),
  component: SearchPage,
});

function SearchPage() {
  return (
    <SongSearchPanel
      title="Search"
      infoNote="This demo only contains {count} songs."
      placeholder="Search by song title, artist or album"
      useTotalForSummary
    />
  );
}
