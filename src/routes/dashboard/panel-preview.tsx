import { createFileRoute } from "@tanstack/react-router";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { ExtensionPanelModeratorPreview } from "~/extension/panel/app";
import { pageTitle } from "~/lib/page-title";

export const Route = createFileRoute("/dashboard/panel-preview")({
  head: () => ({
    meta: [{ title: pageTitle("Panel Preview") }],
  }),
  component: DashboardPanelPreviewPage,
});

function DashboardPanelPreviewPage() {
  return (
    <div className="grid gap-6">
      <DashboardPageHeader
        title="Panel preview"
        description="Mock moderator view of the Twitch panel."
      />

      <div className="flex justify-center">
        <ExtensionPanelModeratorPreview />
      </div>
    </div>
  );
}
