import { useEffect, useMemo, useState } from "react";
import "./App.css";
import OBR from "@owlbear-rodeo/sdk";
import { openFloatingTimerPopover } from "./floatingPopover";
import {
  formatRemaining,
  getRemainingMs,
  isMissingSceneError,
  mapItemsToTimerRows,
  sortTimersByRemaining,
  type TimerRow,
} from "./timerUtils";

function App() {
  const [isReady, setIsReady] = useState(false);
  const [timers, setTimers] = useState<TimerRow[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [hasScene, setHasScene] = useState(true);

  const sortedTimers = useMemo(() => {
    if (nowMs <= 0) return timers;
    return sortTimersByRemaining(timers, nowMs);
  }, [timers, nowMs]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
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

  return (
    <>
      <section>
        <h1>Configured Timers</h1>
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
                <li key={timer.id}>
                  <div>{timer.name}</div>
                  <progress value={remainingMs} max={totalMs} />
                  <div>
                    {formatRemaining(remainingSeconds)} / {timer.duration} min
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void openFloatingTimerPopover(timer.id);
                    }}
                  >
                    Popup
                  </button>
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
