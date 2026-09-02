import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import TimerConfigApp from "./TimerConfigApp";
import OBR from "@owlbear-rodeo/sdk";
import { setupContextMenu } from "./contextMenu";

void fetch(`${import.meta.env.BASE_URL}manifest.json`)
  .then((response) => response.json())
  .then(({ name, version }) => console.log(`${name} - version: ${version}`))
  .catch((error) => console.error("Failed to read extension version", error));

const isTimerConfigInstance =
  new URLSearchParams(window.location.search).get("timer-config") === "1";

OBR.onReady(() => {
  if (!isTimerConfigInstance) setupContextMenu();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isTimerConfigInstance ? <TimerConfigApp /> : <App />}
  </StrictMode>,
);
