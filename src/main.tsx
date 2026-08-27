import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import FloatingTimerApp from "./FloatingTimerApp.tsx";
import OBR from "@owlbear-rodeo/sdk";
import { setupContextMenu } from "./contextMenu";
import { isFloatingInstance } from "./floatingPopover";

const floatingInstance = isFloatingInstance();

OBR.onReady(() => {
  if (floatingInstance) {
    return;
  }

  setupContextMenu();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>{floatingInstance ? <FloatingTimerApp /> : <App />}</StrictMode>,
);
