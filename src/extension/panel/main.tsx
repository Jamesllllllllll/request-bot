import { createRoot } from "react-dom/client";
import "~/app.css";
import { ExtensionPanelApp } from "./app";

const container = document.getElementById("app");

if (!container) {
  throw new Error("Missing #app root for the Twitch panel extension.");
}

createRoot(container).render(<ExtensionPanelApp />);
