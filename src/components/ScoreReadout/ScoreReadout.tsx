import { useEffect, useRef, useState } from "react";
import type { ScoreEvent } from "../../lib/game/round";

/**
 * ScoreReadout — the live score surface, fully self-contained so US-006 can
 * relocate it by moving one element. It owns three things:
 *
 *  1. the running score,
 *  2. the current combo multiplier (rendered visually distinct only when it's
 *     actually boosting — x1 is the neutral resting state and gets no chrome),
 *  3. a short-lived stack of "+200"/"-150" popups, one per discrete score
 *     event (letter gain, wrong-letter loss, zoom cost, time bonus). The clock
 *     is a pure pacer and emits no events, so an ordinary per-second tick never
 *     produces a popup — only a scoring player action does.
 *
 * Concurrent events don't pile up illegibly: each popup is offset by its slot
 * index, and only the most recent MAX_VISIBLE_POPUPS are ever mounted, so a
 * fast burst of guesses reads as a tidy little column that drains on its own
 * rather than an unreadable overlap.
 */

/** How long a single popup lives before it's removed — within the ~1.5s AC. */
export const POPUP_LIFETIME_MS = 1500;

/** Most popups shown at once; older ones drop out immediately when exceeded. */
export const MAX_VISIBLE_POPUPS = 3;

export interface ScoreReadoutProps {
  /** The event-sourced running score (already floored / solve-bonused upstream). */
  score: number;
  /** The combo multiplier the next correct letter would earn (1 = neutral). */
  multiplier: number;
  /** The most recent score event, or null before any has happened. */
  scoreEvent: ScoreEvent | null;
}

interface Popup {
  /** The score event's own monotonic id — a stable React key and de-dupe token. */
  id: number;
  delta: number;
}

/** "+200" for a gain, "-150" for a loss (the minus already ships on a negative number). */
function formatDelta(delta: number): string {
  return delta >= 0 ? `+${delta}` : `${delta}`;
}

export function ScoreReadout({ score, multiplier, scoreEvent }: ScoreReadoutProps) {
  const [popups, setPopups] = useState<Popup[]>([]);
  // The last event id we've already spawned a popup for — guards against React
  // re-running the effect for the same event (StrictMode double-invoke, or an
  // unrelated re-render that doesn't change scoreEvent's identity).
  const lastEventIdRef = useRef<number | null>(null);
  // All in-flight removal timers, cleared on unmount so no setState fires after
  // the component is gone.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (!scoreEvent || scoreEvent.id === lastEventIdRef.current) return;
    lastEventIdRef.current = scoreEvent.id;

    const { id, delta } = scoreEvent;
    // Keep only the newest MAX_VISIBLE_POPUPS: a 4th concurrent event pushes
    // the oldest out of the DOM at once rather than letting the column grow
    // past what stays legible.
    setPopups((prev) => [...prev, { id, delta }].slice(-MAX_VISIBLE_POPUPS));

    const timer = setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== id));
      timersRef.current.delete(timer);
    }, POPUP_LIFETIME_MS);
    timersRef.current.add(timer);
  }, [scoreEvent]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const boosted = multiplier > 1;
  // Fixed character width so 0 → 500 → 1240 never shoves the left edge (or
  // the multiplier badge) — tabular-nums alone still changes box width when
  // digit count changes; ch units pin the reserved slot.
  const scoreWidthCh = Math.max(4, String(score).length);

  return (
    <div className="score-readout" data-testid="score-display">
      {/* Label + big numeral rather than an inline "Score: 1240" run: the
          readout is one of the two loudest things on the round surface after
          the map (US-006), so the number carries the weight and the word
          shrinks to a quiet intrusion-log kicker above it. */}
      <span className="score-readout__label">SCORE</span>
      <span className="score-readout__row">
        <span
          className="score-readout__value"
          style={{ minWidth: `${scoreWidthCh}ch` }}
        >
          {score}
        </span>
        {/* Always mount the badge slot so x1 → x1.5 never shifts the score
            numeral. Visibility (not display:none / conditional mount) keeps
            layout stable while the boost state is still announced only when
            actually above x1. */}
        <span
          className={
            "score-readout__multiplier" +
            (boosted ? "" : " score-readout__multiplier--idle")
          }
          data-testid="score-multiplier"
          aria-hidden={!boosted}
        >
          {boosted ? `×${multiplier}` : "×1"}
        </span>
      </span>
      {/* aria-hidden: the popups are a transient decorative echo of a change
          the score value itself already reflects — announcing each one would
          just spam a screen reader. */}
      <div className="score-readout__popups" aria-hidden="true">
        {popups.map((popup, index) => (
          <span
            key={popup.id}
            data-testid="score-delta"
            className={
              "score-delta " +
              (popup.delta > 0
                ? "score-delta--positive"
                : popup.delta < 0
                  ? "score-delta--negative"
                  : "score-delta--neutral")
            }
            style={{ "--popup-slot": index } as React.CSSProperties}
          >
            {formatDelta(popup.delta)}
          </span>
        ))}
      </div>
    </div>
  );
}
