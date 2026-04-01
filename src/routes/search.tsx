// Route: Renders the public song search experience and advanced search filters.
import { createFileRoute } from "@tanstack/react-router";
import { SongSearchPanel } from "~/components/song-search-panel";
import { useLocaleTranslation } from "~/lib/i18n/client";
import { getLocalizedPageTitle } from "~/lib/i18n/metadata";

export const Route = createFileRoute("/search")({
  head: async () => ({
    meta: [
      {
        title: await getLocalizedPageTitle({
          namespace: "search",
          key: "meta.title",
        }),
      },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { t } = useLocaleTranslation("search");

  return (
    <SongSearchPanel
      title={t("page.title")}
      infoNote={t("page.infoNote", { count: "{count}" })}
      placeholder={t("page.placeholder")}
      useTotalForSummary
    />
  );
}
