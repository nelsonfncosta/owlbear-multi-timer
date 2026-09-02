import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { TIMER_METADATA_KEY } from "./extensionKeys";
import { isMissingSceneError } from "./timerUtils";
import "./App.css";

type LightBehavior = "NONE" | "DIM" | "OFF";

function TimerConfigApp() {
  const [duration, setDuration] = useState("10");
  const [lightBehavior, setLightBehavior] = useState<LightBehavior>("DIM");
  const [error, setError] = useState<string>();
  const [isReady, setIsReady] = useState(false);
  const [hasExistingTimers, setHasExistingTimers] = useState(false);
  const [canRemoveTimers, setCanRemoveTimers] = useState(false);
  const isReadOnly = isReady && hasExistingTimers && !canRemoveTimers;

  const getSelectedItems = async () => {
    const itemIds = (await OBR.player.getSelection()) ?? [];
    if (itemIds.length === 0) return [];

    const items = await OBR.scene.items.getItems();
    return items.filter((item) => itemIds.includes(item.id));
  };

  useEffect(() => {
    let mounted = true;

    const loadSelection = async () => {
      try {
        const items = await getSelectedItems();
        if (!mounted) return;

        setIsReady(true);
        const timerItems = items.filter(
          (item) => item.metadata[TIMER_METADATA_KEY] !== undefined,
        );
        setHasExistingTimers(timerItems.length > 0);

        const isGm = (await OBR.player.getRole()) === "GM";
        const playerId = await OBR.player.getId();
        setCanRemoveTimers(
          isGm ||
            (timerItems.length === items.length &&
              timerItems.every((item) => {
                const metadata = item.metadata[TIMER_METADATA_KEY];
                return (
                  typeof metadata === "object" &&
                  metadata !== null &&
                  (metadata as { createdBy?: unknown }).createdBy === playerId
                );
              })),
        );
      } catch (caughtError) {
        if (!mounted) return;

        console.error("Failed to inspect selected timers", caughtError);
        setError("Could not inspect the selected items.");
      }
    };

    OBR.onReady(() => {
      void loadSelection();
    });
    return () => {
      mounted = false;
    };
  }, []);

  const addTimer = async () => {
    const durationMinutes = Number(duration);
    const itemIds = (await OBR.player.getSelection()) ?? [];

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setError("Enter a duration greater than zero.");
      return;
    }

    if (itemIds.length === 0) {
      setError("No timer targets were selected.");
      return;
    }

    try {
      const startedAtMs = Date.now();
      const endsAtMs = startedAtMs + durationMinutes * 60 * 1000;
      const createdBy = await OBR.player.getId();

      await OBR.scene.items.updateItems(itemIds, (items) => {
        items.forEach((item) => {
          item.metadata[TIMER_METADATA_KEY] = {
            duration: durationMinutes,
            startedAtMs,
            endsAtMs,
            createdBy,
            lightBehavior,
          };
        });
      });
      setHasExistingTimers(true);
      setCanRemoveTimers(true);
    } catch (caughtError) {
      if (isMissingSceneError(caughtError)) {
        setError("Open a scene to add a timer.");
        return;
      }

      console.error("Failed to add timer", caughtError);
      setError("Could not add timer.");
    }
  };

  const removeTimers = async () => {
    try {
      const items = await getSelectedItems();
      const itemIds = items.map((item) => item.id);
      if (!canRemoveTimers || itemIds.length === 0) {
        setError("Only the timer creator or GM can remove these timers.");
        return;
      }

      await OBR.scene.items.updateItems(itemIds, (updatedItems) => {
        updatedItems.forEach((item) => {
          delete item.metadata[TIMER_METADATA_KEY];
        });
      });
      setHasExistingTimers(false);
    } catch (caughtError) {
      if (isMissingSceneError(caughtError)) {
        setError("Open a scene to remove a timer.");
        return;
      }

      console.error("Failed to remove timers", caughtError);
      setError("Could not remove timers.");
    }
  };

  return (
    <main className="timer-config-panel">
      {!isReady && <p>Loading selection...</p>}
      {!isReadOnly && (
        <>
          <label style={{ display: "grid", gap: 4 }}>
            Duration (minutes)
            <input
              type="number"
              min="0.01"
              step="any"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              autoFocus
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            When the timer ends
            <select
              value={lightBehavior}
              onChange={(event) =>
                setLightBehavior(event.target.value as LightBehavior)
              }
            >
              <option value="NONE">Keep light unchanged</option>
              <option value="DIM">Leave a small glow</option>
              <option value="OFF">Turn light off</option>
            </select>
          </label>
        </>
      )}
      {isReadOnly && (
        <p role="status">This timer is managed by another player.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {isReady && !hasExistingTimers && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => void addTimer()}>
            Add Timer
          </button>
        </div>
      )}
      {isReady && hasExistingTimers && canRemoveTimers && (
        <button
          type="button"
          className="timer-config-remove-button"
          onClick={() => void removeTimers()}
        >
          <img
            src={`${import.meta.env.BASE_URL}remove-timer.svg`}
            alt=""
            aria-hidden="true"
          />
          REMOVE TIMER
        </button>
      )}
    </main>
  );
}

export default TimerConfigApp;
