import OBR from "@owlbear-rodeo/sdk";

const ID = "com.owlbearrodeo.multitimer";
const TIMER_METADATA_KEY = `${ID}/metadata`;

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
  OBR.scene.items.updateItems(itemIds, (items) => {
    items.forEach((item) => {
      item.metadata[TIMER_METADATA_KEY] = { duration };
    });
  });
}

function removeTimerMetadata(
  itemIds: Parameters<typeof OBR.scene.items.updateItems>[0],
) {
  OBR.scene.items.updateItems(itemIds, (items) => {
    items.forEach((item) => {
      delete item.metadata[TIMER_METADATA_KEY];
    });
  });
}

export function setupContextMenu() {
  OBR.contextMenu.create({
    id: `${ID}/context-menu`,
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
        icon: "/remove-timer.svg",
        label: "Remove Timer",
        filter: {
          every: [{ key: "layer", value: "CHARACTER" }],
        },
      },
    ],
    onClick(context) {
      if (shouldAddTimer(context)) {
        const duration = promptDurationMinutes();
        if (duration === undefined) return;

        addTimerMetadata(context.items, duration);
        return;
      }

      removeTimerMetadata(context.items);
    },
  });
}
