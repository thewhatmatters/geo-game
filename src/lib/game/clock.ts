export const ROUND_DURATION_SECONDS = 60;

/**
 * Placeholder values pending playtesting (see CLAUDE.md "Open design
 * decisions" — exact tiers/values are explicitly not finalized). Keep as a
 * tunable table, not inline arithmetic, so retuning doesn't touch logic.
 */
export const PENALTY_TIERS: ReadonlyArray<{
  maxUniqueLetters: number;
  penaltySeconds: number;
}> = [
  { maxUniqueLetters: 5, penaltySeconds: 20 },
  { maxUniqueLetters: 9, penaltySeconds: 15 },
  { maxUniqueLetters: Infinity, penaltySeconds: 10 },
];

export function getPenaltySeconds(uniqueLetterCount: number): number {
  const tier = PENALTY_TIERS.find(
    (t) => uniqueLetterCount <= t.maxUniqueLetters,
  );
  return tier ? tier.penaltySeconds : PENALTY_TIERS[PENALTY_TIERS.length - 1].penaltySeconds;
}

/** Every this many CONSECUTIVE correct letter guesses (streak reset by any wrong guess) grants a flat time bonus — positive reinforcement to offset the wrong-guess-only penalty design. */
export const CORRECT_STREAK_BONUS_INTERVAL = 2;
export const CORRECT_STREAK_BONUS_SECONDS = 2;

export type ClockStatus = "running" | "solved" | "failed";

export interface ClockSnapshot {
  status: ClockStatus;
  remainingSeconds: number;
}

type Listener = (snapshot: ClockSnapshot) => void;

export class GameClock {
  private remainingSeconds: number;
  private status: ClockStatus = "running";
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTickMs: number | null = null;
  private readonly listeners = new Set<Listener>();
  /** A bonus can never push remainingSeconds past where the round started — otherwise a long correct streak could bank unbounded time. */
  private readonly initialSeconds: number;

  constructor(durationSeconds: number = ROUND_DURATION_SECONDS) {
    this.remainingSeconds = durationSeconds;
    this.initialSeconds = durationSeconds;
  }

  getSnapshot(): ClockSnapshot {
    return { status: this.status, remainingSeconds: this.remainingSeconds };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts real-time ticking (a repeating interval sampling elapsed wall-clock time). */
  start(): void {
    if (this.status !== "running" || this.intervalId !== null) return;
    this.lastTickMs = Date.now();
    this.intervalId = setInterval(() => {
      const now = Date.now();
      const deltaSeconds = (now - (this.lastTickMs ?? now)) / 1000;
      this.lastTickMs = now;
      this.tick(deltaSeconds);
    }, 200);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Advances the clock by an explicit delta — the real-time driver `start()` uses this internally, and tests call it directly to simulate time deterministically. */
  tick(deltaSeconds: number): void {
    if (this.status !== "running") return;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - deltaSeconds);
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = 0;
      this.status = "failed";
      this.stop();
    }
    this.emit();
  }

  applyWrongGuess(uniqueLetterCount: number): void {
    this.applyPenalty(getPenaltySeconds(uniqueLetterCount));
  }

  /** Generic flat time deduction — used by both the wrong-guess penalty and the zoom-out penalty. */
  applyPenalty(seconds: number): void {
    if (this.status !== "running") return;
    this.tick(seconds);
  }

  /** Generic flat time addition — used by the correct-guess streak bonus. Clamped at the round's starting duration so a long streak can't bank time indefinitely. */
  applyBonus(seconds: number): void {
    if (this.status !== "running") return;
    this.remainingSeconds = Math.min(this.initialSeconds, this.remainingSeconds + seconds);
    this.emit();
  }

  solve(): void {
    if (this.status !== "running") return;
    this.status = "solved";
    this.stop();
    this.emit();
  }

  /** Explicit give-up: same terminal state as running out the clock. */
  giveUp(): void {
    if (this.status !== "running") return;
    this.status = "failed";
    this.stop();
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
