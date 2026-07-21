import { LOCKOUT_ATTEMPT_BUDGET } from "../../lib/game/round";

export interface LockoutStripProps {
  /** Wrong guesses left before the round ends (see RoundCore's lockoutAttemptsRemaining). */
  attemptsRemaining: number;
}

/**
 * The 0:00 lockout banner: one pip per attempt in the budget (spent pips go
 * hollow, left to right) above an intrusion-log line naming the stakes.
 *
 * Mounted only while the round is in lockout — the clock hitting 0:00 IS the
 * flip (see inLockout), so this strip appearing is the player's signal that
 * the pacer ran out and the attempt budget is now what's between them and a
 * failed round. Monochrome by design: red is reserved for negative score
 * events, and the pips draining is already the alarm.
 */
export function LockoutStrip({ attemptsRemaining }: LockoutStripProps) {
  const remaining = Math.max(0, attemptsRemaining);
  return (
    <div className="lockout" data-testid="lockout-strip" role="status">
      {/* aria-hidden: the pips are a visual echo of the count the label
          below already states in words. */}
      <div className="lockout__pips" data-testid="lockout-pips" aria-hidden="true">
        {Array.from({ length: LOCKOUT_ATTEMPT_BUDGET }, (_, i) => (
          <span
            key={i}
            className={`lockout__pip${i < remaining ? " lockout__pip--live" : " lockout__pip--spent"}`}
          />
        ))}
      </div>
      <p className="lockout__label" data-testid="lockout-label">
        SYSTEM LOCKOUT IN {remaining} {remaining === 1 ? "ATTEMPT" : "ATTEMPTS"}
      </p>
    </div>
  );
}
