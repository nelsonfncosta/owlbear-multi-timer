import { useEffect, useState } from "react";
import "./App.css";
import OBR from "@owlbear-rodeo/sdk";
import { TIMER_METADATA_KEY } from "./extensionKeys";

type TimerRow = {
  id: string;
  name: string;
  duration: number;
  startedAtMs: number;
  endsAtMs: number;
};

type TimerMetadata = {
  duration?: unknown;
  startedAtMs?: unknown;
  endsAtMs?: unknown;
};

function getPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function getTimerFromMetadata(
  value: unknown,
): { duration: number; startedAtMs: number; endsAtMs: number } | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const metadata = value as TimerMetadata;
  const duration = getPositiveNumber(metadata.duration);
  const startedAtMs = getPositiveNumber(metadata.startedAtMs);
  const endsAtMs = getPositiveNumber(metadata.endsAtMs);

  if (
    duration === undefined ||
    startedAtMs === undefined ||
    endsAtMs === undefined ||
    endsAtMs <= startedAtMs
  ) {
    return undefined;
  }

  return { duration, startedAtMs, endsAtMs };
}

function mapItemsToTimerRows(
  items: Awaited<ReturnType<typeof OBR.scene.items.getItems>>,
): TimerRow[] {
  return items
    .map((item) => {
      const timer = getTimerFromMetadata(item.metadata[TIMER_METADATA_KEY]);
      if (timer === undefined) return undefined;

      return {
        id: item.id,
        name: item.name || "Unnamed",
        duration: timer.duration,
        startedAtMs: timer.startedAtMs,
        endsAtMs: timer.endsAtMs,
      };
    })
    .filter((item): item is TimerRow => item !== undefined);
}

function formatRemaining(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function App() {
  const [isReady, setIsReady] = useState(false);
  const [timers, setTimers] = useState<TimerRow[]>([]);
  const [nowMs, setNowMs] = useState(0);

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
      const items = await OBR.scene.items.getItems();
      if (!isMounted) return;

      setTimers(mapItemsToTimerRows(items));
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
        {isReady && timers.length === 0 && <p>No timers configured.</p>}
        {isReady && timers.length > 0 && (
          <ul className="timer-list">
            {timers.map((timer) => {
              const currentMs = nowMs > 0 ? nowMs : timer.startedAtMs;
              const totalMs = Math.max(1, timer.endsAtMs - timer.startedAtMs);
              const remainingMs = Math.max(0, timer.endsAtMs - currentMs);
              const remainingSeconds = Math.ceil(remainingMs / 1000);

              return (
                <li key={timer.id}>
                  <div>{timer.name}</div>
                  <progress value={remainingMs} max={totalMs} />
                  <div>
                    {formatRemaining(remainingSeconds)} / {timer.duration} min
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
