import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import OBR from "@owlbear-rodeo/sdk";
import {
  formatRemaining,
  getRemainingMs,
  isMissingSceneError,
  mapItemsToTimerRows,
  sortTimersByRemaining,
  type TimerRow,
} from "./timerUtils";
import { TIMER_METADATA_KEY } from "./extensionKeys";

type TimerMetadata = {
  duration?: unknown;
  startedAtMs?: unknown;
  endsAtMs?: unknown;
  pausedAtMs?: unknown;
};

function App() {
  const [isReady, setIsReady] = useState(false);
  const [timers, setTimers] = useState<TimerRow[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [hasScene, setHasScene] = useState(true);
  const notifiedCompleteTimersRef = useRef(new Set<string>());
  const observedActiveTimersRef = useRef(new Set<string>());

  const toggleTimerPaused = async (timer: TimerRow) => {
    try {
      const now = nowMs > 0 ? nowMs : timer.startedAtMs;
      // Keep the UI clock aligned with this interaction to avoid +1s visual jumps.
      setNowMs(now);

      await OBR.scene.items.updateItems([timer.id], (items) => {
        items.forEach((item) => {
          const metadata = item.metadata[TIMER_METADATA_KEY] as
            | TimerMetadata
            | undefined;

          if (metadata === undefined || typeof metadata !== "object") return;

          const pausedAtMs =
            typeof metadata.pausedAtMs === "number" &&
            Number.isFinite(metadata.pausedAtMs)
              ? metadata.pausedAtMs
              : undefined;

          if (pausedAtMs !== undefined) {
            const pauseDurationMs = Math.max(0, now - pausedAtMs);
            const startedAtMs =
              typeof metadata.startedAtMs === "number" &&
              Number.isFinite(metadata.startedAtMs)
                ? metadata.startedAtMs
                : undefined;
            const endsAtMs =
              typeof metadata.endsAtMs === "number" &&
              Number.isFinite(metadata.endsAtMs)
                ? metadata.endsAtMs
                : undefined;

            if (startedAtMs === undefined || endsAtMs === undefined) return;

            item.metadata[TIMER_METADATA_KEY] = {
              ...metadata,
              startedAtMs: startedAtMs + pauseDurationMs,
              endsAtMs: endsAtMs + pauseDurationMs,
            };
            delete (
              item.metadata[TIMER_METADATA_KEY] as { pausedAtMs?: number }
            ).pausedAtMs;
            return;
          }

          item.metadata[TIMER_METADATA_KEY] = {
            ...metadata,
            pausedAtMs: now,
          };
        });
      });
    } catch (error) {
      if (isMissingSceneError(error)) {
        setHasScene(false);
        return;
      }

      console.error("Failed to toggle timer pause state", error);
    }
  };

  const sortedTimers = useMemo(() => {
    if (nowMs <= 0) return timers;
    return sortTimersByRemaining(timers, nowMs);
  }, [timers, nowMs]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setNowMs(Date.now());
    }, 0);

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    const refreshTimers = async () => {
      try {
        const items = await OBR.scene.items.getItems();
        if (!isMounted) return;

        setHasScene(true);
        setTimers(mapItemsToTimerRows(items));
      } catch (error) {
        if (!isMounted) return;

        if (isMissingSceneError(error)) {
          setHasScene(false);
          setTimers([]);
          return;
        }

        console.error("Failed to refresh timers", error);
      }
    };

    OBR.onReady(async () => {
      if (!isMounted) return;

      setIsReady(true);
      await refreshTimers();

      unsubscribe = OBR.scene.items.onChange(() => {
        void refreshTimers();
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isReady || !hasScene || nowMs <= 0) return;

    const currentTimerKeys = new Set(
      sortedTimers.map((timer) => `${timer.id}:${timer.endsAtMs}`),
    );

    // Remove stale entries so new timers on the same token can notify again.
    notifiedCompleteTimersRef.current.forEach((key) => {
      if (!currentTimerKeys.has(key)) {
        notifiedCompleteTimersRef.current.delete(key);
      }
    });

    observedActiveTimersRef.current.forEach((key) => {
      if (!currentTimerKeys.has(key)) {
        observedActiveTimersRef.current.delete(key);
      }
    });

    sortedTimers.forEach((timer) => {
      const completionKey = `${timer.id}:${timer.endsAtMs}`;
      if (notifiedCompleteTimersRef.current.has(completionKey)) return;

      const remainingMs = getRemainingMs(timer, nowMs);

      if (remainingMs > 0) {
        observedActiveTimersRef.current.add(completionKey);
        return;
      }

      // Only notify if this timer was observed active in this session.
      if (observedActiveTimersRef.current.has(completionKey)) {
        notifiedCompleteTimersRef.current.add(completionKey);
        void OBR.notification.show(`Timer finished: ${timer.name}`, "INFO");
      }
    });
  }, [hasScene, isReady, nowMs, sortedTimers]);

  return (
    <>
      <section className="timer-panel">
        {!isReady && <p>Connecting to Owlbear...</p>}
        {isReady && !hasScene && <p>Open a scene to view timers.</p>}
        {isReady && timers.length === 0 && <p>No timers configured.</p>}
        {isReady && sortedTimers.length > 0 && (
          <ul className="timer-list">
            {sortedTimers.map((timer) => {
              const currentMs = nowMs > 0 ? nowMs : timer.startedAtMs;
              const totalMs = Math.max(1, timer.endsAtMs - timer.startedAtMs);
              const remainingMs = getRemainingMs(timer, currentMs);
              const remainingSeconds = Math.ceil(remainingMs / 1000);

              return (
                <li key={timer.id} className="timer-list-item">
                  <div className="timer-name">{timer.name}</div>
                  <progress
                    value={remainingMs}
                    max={totalMs}
                    onClick={() => {
                      void toggleTimerPaused(timer);
                    }}
                    className={timer.pausedAtMs ? "is-paused" : undefined}
                    title={
                      timer.pausedAtMs ? "Click to resume" : "Click to pause"
                    }
                  />
                  <div className="timer-remaining">
                    {formatRemaining(remainingSeconds)} / {timer.duration} min
                    {timer.pausedAtMs ? " (paused)" : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

export default App;
