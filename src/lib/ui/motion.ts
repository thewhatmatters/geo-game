/**
 * The one place that asks the platform whether the player wants motion.
 *
 * CSS handles the bulk of it (see the `prefers-reduced-motion` block in
 * index.css); this covers the cases CSS can't reach — JS-driven animation
 * (framer-motion durations outside a component that can call
 * `useReducedMotion`) and effects with no element at all, like the confetti
 * burst. Safe outside a browser (SSR tests): no matchMedia → no reduction.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
