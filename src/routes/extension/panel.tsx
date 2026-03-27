import { createFileRoute } from "@tanstack/react-router";
import { ExtensionPanelApp } from "~/extension/panel/app";
import { pageTitle } from "~/lib/page-title";

export const Route = createFileRoute("/extension/panel")({
  head: () => ({
    meta: [{ title: pageTitle("Twitch Panel") }],
  }),
  component: ExtensionPanelRoute,
});

function ExtensionPanelRoute() {
  return <ExtensionPanelApp />;
}
