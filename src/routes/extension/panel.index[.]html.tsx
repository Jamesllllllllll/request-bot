import { createFileRoute } from "@tanstack/react-router";
import { ExtensionPanelApp } from "~/extension/panel/app";
import { pageTitle } from "~/lib/page-title";

export const Route = createFileRoute("/extension/panel/index.html")({
  head: () => ({
    meta: [{ title: pageTitle("Twitch Panel") }],
  }),
  component: ExtensionPanelIndexHtmlRoute,
});

function ExtensionPanelIndexHtmlRoute() {
  return <ExtensionPanelApp />;
}
