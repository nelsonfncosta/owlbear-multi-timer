import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID, TIMER_METADATA_KEY } from "./extensionKeys";

function isMissingSceneError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  const maybeError = error as {
    name?: string;
    message?: string;
    error?: { name?: string; message?: string };
  };

  const name = maybeError.error?.name ?? maybeError.name;
  const message = maybeError.error?.message ?? maybeError.message;

  return name === "MissingDataError" || message === "No scene found";
}

function notifySceneRequired(error: unknown) {
  if (isMissingSceneError(error)) {
    OBR.notification.show("Open a scene to manage timers.", "WARNING");
    return;
  }

  console.error("Timer update failed", error);
}

function shouldAddTimer(
  context: Parameters<
    NonNullable<Parameters<typeof OBR.contextMenu.create>[0]["onClick"]>
  >[0],
) {
  return context.items.every(
    (item) => item.metadata[TIMER_METADATA_KEY] === undefined,
  );
}

function promptDurationMinutes() {
  const input = window.prompt("Enter duration in minutes:");
  if (input === null) return undefined;

  const duration = Number(input);
  if (!Number.isFinite(duration) || duration <= 0) return undefined;

  return duration;
}

function addTimerMetadata(
  itemIds: Parameters<typeof OBR.scene.items.updateItems>[0],
  duration: number,
) {
  const startedAtMs = Date.now();
  const endsAtMs = startedAtMs + duration * 60 * 1000;

  return OBR.scene.items.updateItems(itemIds, (items) => {
    items.forEach((item) => {
      item.metadata[TIMER_METADATA_KEY] = {
        duration,
        startedAtMs,
        endsAtMs,
      };
    });
  });
}

function removeTimerMetadata(
  itemIds: Parameters<typeof OBR.scene.items.updateItems>[0],
) {
  return OBR.scene.items.updateItems(itemIds, (items) => {
    items.forEach((item) => {
      delete item.metadata[TIMER_METADATA_KEY];
    });
  });
}

export function setupContextMenu() {
  OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu`,
    icons: [
      {
        icon: "/icons.svg",
        label: "Add Timer",
        filter: {
          every: [
            { key: "layer", value: "CHARACTER" },
            { key: ["metadata", TIMER_METADATA_KEY], value: undefined },
          ],
        },
      },
      {
        icon: "/icons.svg",
        label: "Add Timer",
        filter: {
          every: [
            { key: "layer", value: "PROP" },
            { key: ["metadata", TIMER_METADATA_KEY], value: undefined },
          ],
        },
      },
      {
        icon: "/remove-timer.svg",
        label: "Remove Timer",
        filter: {
          every: [{ key: "layer", value: "CHARACTER" }],
        },
      },
      {
        icon: "/remove-timer.svg",
        label: "Remove Timer",
        filter: {
          every: [{ key: "layer", value: "PROP" }],
        },
      },
    ],
    onClick(context) {
      console.log("Context menu clicked:", context.items);
      if (shouldAddTimer(context)) {
        const duration = promptDurationMinutes();
        if (duration === undefined) return;

        void addTimerMetadata(context.items, duration).catch(
          notifySceneRequired,
        );
        return;
      }

      void removeTimerMetadata(context.items).catch(notifySceneRequired);
    },
  });
}
