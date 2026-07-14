import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GameClock, getPenaltySeconds, PENALTY_TIERS, ROUND_DURATION_SECONDS } from "./clock";

describe("getPenaltySeconds", () => {
  it("applies the harshest tier at <=5 unique letters", () => {
    expect(getPenaltySeconds(1)).toBe(20);
    expect(getPenaltySeconds(5)).toBe(20);
  });

  it("applies the middle tier at 6-9 unique letters", () => {
    expect(getPenaltySeconds(6)).toBe(15);
    expect(getPenaltySeconds(9)).toBe(15);
  });

  it("applies the lightest tier at 10+ unique letters", () => {
    expect(getPenaltySeconds(10)).toBe(10);
    expect(getPenaltySeconds(26)).toBe(10);
  });

  it("exposes the tiers as a named, inspectable table", () => {
    expect(PENALTY_TIERS.length).toBe(3);
  });
});

describe("GameClock", () => {
  it("starts at the 60-second default, running", () => {
    const clock = new GameClock();
    expect(clock.getSnapshot()).toEqual({
      status: "running",
      remainingSeconds: ROUND_DURATION_SECONDS,
    });
  });

  it("accepts a custom initial duration", () => {
    const clock = new GameClock(10);
    expect(clock.getSnapshot().remainingSeconds).toBe(10);
  });

  it("ticks down by an explicit delta", () => {
    const clock = new GameClock(60);
    clock.tick(12.5);
    expect(clock.getSnapshot().remainingSeconds).toBe(47.5);
  });

  it("subtracts the correct penalty tier on a wrong guess", () => {
    const clock = new GameClock(60);
    clock.applyWrongGuess(4); // <=5 unique letters -> -20s
    expect(clock.getSnapshot().remainingSeconds).toBe(40);
    clock.applyWrongGuess(12); // 10+ unique letters -> -10s
    expect(clock.getSnapshot().remainingSeconds).toBe(30);
  });

  it("adds time on a bonus", () => {
    const clock = new GameClock(60);
    clock.tick(20); // 40 remaining
    clock.applyBonus(2);
    expect(clock.getSnapshot().remainingSeconds).toBe(42);
  });

  it("clamps a bonus at the round's starting duration", () => {
    const clock = new GameClock(60);
    clock.tick(1); // 59 remaining
    clock.applyBonus(5); // would be 64, clamped to 60
    expect(clock.getSnapshot().remainingSeconds).toBe(60);
  });

  it("ignores a bonus once the round has ended", () => {
    const clock = new GameClock(60);
    clock.giveUp();
    clock.applyBonus(2);
    expect(clock.getSnapshot().remainingSeconds).toBe(60);
  });

  it("transitions to failed when the clock reaches 0, clamped at 0", () => {
    const clock = new GameClock(5);
    clock.tick(10);
    const snapshot = clock.getSnapshot();
    expect(snapshot.status).toBe("failed");
    expect(snapshot.remainingSeconds).toBe(0);
  });

  it("ignores further ticks and guesses once failed", () => {
    const clock = new GameClock(5);
    clock.tick(10);
    clock.tick(5);
    clock.applyWrongGuess(1);
    expect(clock.getSnapshot()).toEqual({ status: "failed", remainingSeconds: 0 });
  });

  it("give-up transitions to failed immediately regardless of remaining time", () => {
    const clock = new GameClock(60);
    clock.giveUp();
    const snapshot = clock.getSnapshot();
    expect(snapshot.status).toBe("failed");
    expect(snapshot.remainingSeconds).toBe(60);
  });

  it("solve transitions to a solved status, not failed", () => {
    const clock = new GameClock(60);
    clock.solve();
    expect(clock.getSnapshot().status).toBe("solved");
  });

  it("notifies subscribers on every state change", () => {
    const clock = new GameClock(60);
    const listener = vi.fn();
    clock.subscribe(listener);
    clock.tick(1);
    clock.giveUp();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({ status: "failed", remainingSeconds: 59 });
  });

  it("unsubscribe stops further notifications", () => {
    const clock = new GameClock(60);
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);
    unsubscribe();
    clock.tick(1);
    expect(listener).not.toHaveBeenCalled();
  });

  describe("real-time ticking via start()/stop()", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("counts down as wall-clock time advances after start()", () => {
      const clock = new GameClock(60);
      clock.start();
      vi.advanceTimersByTime(1000);
      const snapshot = clock.getSnapshot();
      expect(snapshot.status).toBe("running");
      expect(snapshot.remainingSeconds).toBeCloseTo(59, 1);
      clock.stop();
    });

    it("reaches failed on its own once enough real time elapses", () => {
      const clock = new GameClock(2);
      clock.start();
      vi.advanceTimersByTime(3000);
      expect(clock.getSnapshot()).toEqual({ status: "failed", remainingSeconds: 0 });
    });

    it("stop() halts further ticking", () => {
      const clock = new GameClock(60);
      clock.start();
      vi.advanceTimersByTime(1000);
      clock.stop();
      const afterStop = clock.getSnapshot().remainingSeconds;
      vi.advanceTimersByTime(2000);
      expect(clock.getSnapshot().remainingSeconds).toBe(afterStop);
    });
  });
});
