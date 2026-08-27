import OBR from "@owlbear-rodeo/sdk";
import { TIMER_METADATA_KEY } from "./extensionKeys";

export type TimerRow = {
  id: string;
  name: string;
  duration: number;
  startedAtMs: number;
  endsAtMs: number;
  pausedAtMs?: number;
};

type TimerMetadata = {
  duration?: unknown;
  startedAtMs?: unknown;
  endsAtMs?: unknown;
  pausedAtMs?: unknown;
};

export function isMissingSceneError(error: unknown) {
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

function getPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function getTimerFromMetadata(
  value: unknown,
): {
  duration: number;
  startedAtMs: number;
  endsAtMs: number;
  pausedAtMs?: number;
} | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const metadata = value as TimerMetadata;
  const duration = getPositiveNumber(metadata.duration);
  const startedAtMs = getPositiveNumber(metadata.startedAtMs);
  const endsAtMs = getPositiveNumber(metadata.endsAtMs);
  const pausedAtMs = getPositiveNumber(metadata.pausedAtMs);

  if (
    duration === undefined ||
    startedAtMs === undefined ||
    endsAtMs === undefined ||
    endsAtMs <= startedAtMs
  ) {
    return undefined;
  }

  if (pausedAtMs !== undefined && pausedAtMs < startedAtMs) {
    return undefined;
  }

  return { duration, startedAtMs, endsAtMs, pausedAtMs };
}

export function mapItemsToTimerRows(
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
        ...(timer.pausedAtMs !== undefined
          ? { pausedAtMs: timer.pausedAtMs }
          : {}),
      };
    })
    .filter((item): item is TimerRow => item !== undefined);
}

export function formatRemaining(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getRemainingMs(timer: TimerRow, nowMs: number) {
  const effectiveNowMs = timer.pausedAtMs ?? nowMs;
  return Math.max(0, timer.endsAtMs - effectiveNowMs);
}

export function sortTimersByRemaining(
  timers: TimerRow[],
  nowMs: number,
): TimerRow[] {
  return [...timers].sort((a, b) => {
    const aRemaining = getRemainingMs(a, nowMs);
    const bRemaining = getRemainingMs(b, nowMs);
    const aComplete = aRemaining <= 0;
    const bComplete = bRemaining <= 0;

    // Keep ongoing timers above completed timers.
    if (aComplete !== bComplete) {
      return aComplete ? 1 : -1;
    }

    // Within the same group, sort by remaining time.
    if (aRemaining !== bRemaining) {
      return aRemaining - bRemaining;
    }

    return a.endsAtMs - b.endsAtMs;
  });
}
