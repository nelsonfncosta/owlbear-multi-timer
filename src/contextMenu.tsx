import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID, TIMER_CONFIG_POPOVER_URL } from "./extensionKeys";

const addTimerIconUrl = `${import.meta.env.BASE_URL}icons.svg`;

export function setupContextMenu() {
  OBR.contextMenu.create({
    id: `${EXTENSION_ID}/add-timer-context-menu`,
    icons: [
      {
        icon: addTimerIconUrl,
        label: "Multi Timer",
        filter: {
          every: [{ key: "layer", value: "CHARACTER" }],
        },
      },
      {
        icon: addTimerIconUrl,
        label: "Multi Timer",
        filter: {
          every: [{ key: "layer", value: "PROP" }],
        },
      },
    ],
    embed: {
      url: `${import.meta.env.BASE_URL}${TIMER_CONFIG_POPOVER_URL}`,
      height: 200,
    },
    onClick() {},
  });
}
