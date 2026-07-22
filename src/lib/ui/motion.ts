/**
 * Motion helpers for prefers-reduced-motion.
 *
 * Framer Motion's `useReducedMotion()` is the React hook form; this module is
 * the pure / non-hook form for reducers, CSS-adjacent JS, and effects that
 * cannot call hooks (confetti, one-shot timers, mount defaults).
 */

/** True when the user has requested reduced motion (or SSR has no window). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Duration in seconds for Framer Motion transitions. Reduced-motion users get
 * 0 so pathLength / opacity / x snaps complete in the same frame.
 */
export function motionDuration(seconds: number, reduceMotion: boolean | null): number {
  return reduceMotion ? 0 : seconds;
}
