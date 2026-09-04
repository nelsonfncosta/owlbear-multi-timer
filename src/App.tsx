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
import {
  DYNAMIC_FOG_LIGHT_METADATA_KEY,
  TIMER_METADATA_KEY,
} from "./extensionKeys";
import { focusViewportOnItems } from "./viewportUtils";

const restartIconUrl = `${import.meta.env.BASE_URL}restart.svg`;
const removeTimerIconUrl = `${import.meta.env.BASE_URL}remove-timer.svg`;
const bugIconUrl = `${import.meta.env.BASE_URL}bug.svg`;

type TimerMetadata = {
  duration?: unknown;
  startedAtMs?: unknown;
  endsAtMs?: unknown;
  pausedAtMs?: unknown;
  lightBeforeCompletion?: unknown;
};

function isMetadataObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function App() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [timers, setTimers] = useState<TimerRow[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [hasScene, setHasScene] = useState(true);
  const [playerId, setPlayerId] = useState<string>();
  const [isGm, setIsGm] = useState(false);
  const notifiedCompleteTimersRef = useRef(new Set<string>());
  const observedActiveTimersRef = useRef(new Set<string>());

  // Allow action popover to resize dynamically based on the section content.
  useEffect(() => {
    if (!isReady) return;

    const section = sectionRef.current;
    if (!section) return;

    let frameId = 0;
    let lastHeight = 0;

    const updatePopoverHeight = () => {
      const height = Math.max(100, Math.ceil(section.scrollHeight));
      if (height === lastHeight) return;

      lastHeight = height;
      void OBR.action.setHeight(height).catch((error) => {
        console.error("Failed to resize timer popover", error);
      });
    };

    const observer = new ResizeObserver(() => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updatePopoverHeight();
      });
    });

    observer.observe(section);
    updatePopoverHeight();

    return () => {
      observer.disconnect();
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [isReady]);

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

  const restartTimer = async (timer: TimerRow) => {
    try {
      const now = nowMs > 0 ? nowMs : timer.startedAtMs;
      setNowMs(now);

      await OBR.scene.items.updateItems([timer.id], (items) => {
        items.forEach((item) => {
          const metadata = item.metadata[TIMER_METADATA_KEY] as
            | TimerMetadata
            | undefined;

          if (metadata === undefined || typeof metadata !== "object") return;

          const durationMinutes =
            typeof metadata.duration === "number" &&
            Number.isFinite(metadata.duration) &&
            metadata.duration > 0
              ? metadata.duration
              : timer.duration;

          const durationMs = durationMinutes * 60 * 1000;

          item.metadata[TIMER_METADATA_KEY] = {
            ...metadata,
            duration: durationMinutes,
            startedAtMs: now,
            endsAtMs: now + durationMs,
          };

          const previousLight = metadata.lightBeforeCompletion;
          if (isMetadataObject(previousLight)) {
            item.metadata[DYNAMIC_FOG_LIGHT_METADATA_KEY] = previousLight;
          }

          delete (item.metadata[TIMER_METADATA_KEY] as TimerMetadata)
            .pausedAtMs;
          delete (item.metadata[TIMER_METADATA_KEY] as TimerMetadata)
            .lightBeforeCompletion;
        });
      });
    } catch (error) {
      if (isMissingSceneError(error)) {
        setHasScene(false);
        return;
      }

      console.error("Failed to restart timer", error);
    }
  };

  const removeTimer = async (timerId: string) => {
    try {
      await OBR.scene.items.updateItems([timerId], (items) => {
        items.forEach((item) => {
          delete item.metadata[TIMER_METADATA_KEY];
        });
      });
    } catch (error) {
      if (isMissingSceneError(error)) {
        setHasScene(false);
        return;
      }

      console.error("Failed to remove timer", error);
    }
  };

  const centerOnTimer = async (timer: TimerRow) => {
    try {
      await focusViewportOnItems([timer.id]);
    } catch (error) {
      if (isMissingSceneError(error)) {
        setHasScene(false);
        return;
      }

      console.error("Failed to center viewport on timer", error);
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

      const [currentPlayerId, role] = await Promise.all([
        OBR.player.getId(),
        OBR.player.getRole(),
      ]);
      if (!isMounted) return;

      setPlayerId(currentPlayerId);
      setIsGm(role === "GM");
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

        const canManageTimer = isGm || timer.createdBy === playerId;
        const lightBehavior = timer.lightBehavior ?? "DIM";
        if (canManageTimer && lightBehavior !== "NONE") {
          void OBR.scene.items
            .updateItems([timer.id], (items) => {
              items.forEach((item) => {
                if (lightBehavior === "OFF") {
                  const light = item.metadata[DYNAMIC_FOG_LIGHT_METADATA_KEY];
                  const timerMetadata = item.metadata[TIMER_METADATA_KEY];
                  if (
                    isMetadataObject(light) &&
                    isMetadataObject(timerMetadata)
                  ) {
                    item.metadata[TIMER_METADATA_KEY] = {
                      ...timerMetadata,
                      lightBeforeCompletion: { ...light },
                    };
                  }

                  delete item.metadata[DYNAMIC_FOG_LIGHT_METADATA_KEY];
                  return;
                }

                const light = item.metadata[DYNAMIC_FOG_LIGHT_METADATA_KEY];
                if (typeof light !== "object" || light === null) return;

                const timerMetadata = item.metadata[TIMER_METADATA_KEY];
                if (isMetadataObject(timerMetadata)) {
                  item.metadata[TIMER_METADATA_KEY] = {
                    ...timerMetadata,
                    lightBeforeCompletion: {
                      ...(light as Record<string, unknown>),
                    },
                  };
                }

                item.metadata[DYNAMIC_FOG_LIGHT_METADATA_KEY] = {
                  ...(light as Record<string, unknown>),
                  attenuationRadius: 100,
                  sourceRadius: 4,
                };
              });
            })
            .catch((error) => {
              console.error("Failed to dim timer light", error);
            });
        }
      }
    });
  }, [hasScene, isGm, isReady, nowMs, playerId, sortedTimers]);

  return (
    <>
      <section ref={sectionRef} className="timer-panel">
        <header className="timer-panel-header">
          <strong>Timers</strong>
          <a
            href="https://github.com/nelsonfncosta/owlbear-multi-timer/issues"
            target="_blank"
            rel="noreferrer"
            className="timer-bug-link"
            title="Report a bug"
            aria-label="Report a bug"
          >
            <img src={bugIconUrl} alt="" aria-hidden="true" />
          </a>
        </header>
        <div className="timer-panel-divider" />
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
              const canManageTimer = isGm || timer.createdBy === playerId;

              return (
                <li key={timer.id} className="timer-list-item">
                  <div className="timer-header">
                    <button
                      type="button"
                      className="timer-name-button"
                      onClick={() => void centerOnTimer(timer)}
                      title={`Center view on ${timer.name}`}
                    >
                      {timer.name}
                    </button>
                    {canManageTimer && (
                      <button
                        type="button"
                        className="timer-remove-button"
                        onClick={() => {
                          void removeTimer(timer.id);
                        }}
                        title="Remove timer"
                        aria-label={`Remove timer ${timer.name}`}
                      >
                        <img
                          src={removeTimerIconUrl}
                          alt=""
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                  <progress
                    value={remainingMs}
                    max={totalMs}
                    onClick={
                      canManageTimer
                        ? () => {
                            void toggleTimerPaused(timer);
                          }
                        : undefined
                    }
                    className={
                      canManageTimer
                        ? timer.pausedAtMs
                          ? "is-paused is-interactive"
                          : "is-interactive"
                        : timer.pausedAtMs
                          ? "is-paused"
                          : undefined
                    }
                    title={
                      canManageTimer
                        ? timer.pausedAtMs
                          ? "Click to resume"
                          : "Click to pause"
                        : undefined
                    }
                  />
                  <div className="timer-remaining">
                    <span>
                      {formatRemaining(remainingSeconds)} / {timer.duration} min
                      {timer.pausedAtMs ? " (paused)" : ""}
                    </span>
                    {canManageTimer && (
                      <button
                        type="button"
                        className="timer-restart-button"
                        onClick={() => {
                          void restartTimer(timer);
                        }}
                        title="Restart timer"
                        aria-label={`Restart timer ${timer.name}`}
                      >
                        <img src={restartIconUrl} alt="" aria-hidden="true" />
                      </button>
                    )}
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
