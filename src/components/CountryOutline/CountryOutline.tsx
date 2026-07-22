import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { pathBounds, boundsToViewBox } from "../../lib/geo/pathBounds";
import { motionDuration } from "../../lib/ui/motion";

/** Smooths the ~200ms clock-tick increments of the normal draw-in. */
const DRAW_TRANSITION_SECONDS = 0.3;
/**
 * Completion jumps at least this many points in one update are discrete
 * events, not clock flow — terminal-state closure (round.ts's completion
 * selectors return 100 the moment the round ends) or a big time penalty
 * advancing the time-derived completion all at once. Give those a longer
 * eased sweep so they read as a reveal, not a snap. Ordinary tick
 * increments are ~1-2 points, so they never cross this.
 */
const CLOSURE_JUMP_THRESHOLD = 15;
const CLOSURE_TRANSITION_SECONDS = 1.4;

export interface CountryPathProps {
  /** SVG path string in the shared world-projected frame produced by scripts/generate-countries-geo.mjs. */
  path: string;
  /** How much of the outline should be drawn, 0-100. */
  completion: number;
  strokeColor?: string;
  strokeWidth?: number;
  /** Fill color, defaults to none (outline only). Callers can swap this in once completion reaches 100 for a "filled in" look (see NeighborsLayer). */
  fillColor?: string;
}

/** Just the animated outline stroke, no wrapping <svg> — for composing multiple countries inside one shared-viewBox scene (see NeighborsLayer). */
export function CountryPath({
  path,
  completion,
  strokeColor = "currentColor",
  strokeWidth = 1.5,
  fillColor = "none",
}: CountryPathProps) {
  const reduceMotion = useReducedMotion();
  const pathLength = Math.min(100, Math.max(0, completion)) / 100;

  // Previous completion (0-1), tracked to detect the terminal-closure jump.
  const prevPathLengthRef = useRef(pathLength);
  const isClosureJump = (pathLength - prevPathLengthRef.current) * 100 >= CLOSURE_JUMP_THRESHOLD;
  useEffect(() => {
    prevPathLengthRef.current = pathLength;
  }, [pathLength]);

  const duration = motionDuration(
    isClosureJump ? CLOSURE_TRANSITION_SECONDS : DRAW_TRANSITION_SECONDS,
    reduceMotion,
  );

  return (
    <motion.path
      d={path}
      fill={fillColor}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={{ pathLength, pathSpacing: 1 }}
      transition={
        isClosureJump
          ? { duration, ease: "easeOut" }
          : { duration, ease: "linear" }
      }
      style={{ transition: reduceMotion ? "none" : "fill 0.6s ease" }}
    />
  );
}

export interface CountryOutlineProps extends CountryPathProps {
  /** SVG viewBox string. Defaults to a tight box auto-computed from `path`'s own bounds — fine for a single country shown in isolation, but a target+neighbors scene should pass a shared viewBox explicitly (see computeGeoScene). */
  viewBox?: string;
  className?: string;
}

/** A single country outline in its own <svg>, auto-sized to its own bounds unless `viewBox` is given. */
export function CountryOutline({ path, completion, viewBox, className, strokeColor, strokeWidth }: CountryOutlineProps) {
  const box = viewBox ?? boundsToViewBox(pathBounds(path), 0.1);

  return (
    <svg viewBox={box} className={className} xmlns="http://www.w3.org/2000/svg">
      <CountryPath path={path} completion={completion} strokeColor={strokeColor} strokeWidth={strokeWidth} />
    </svg>
  );
}
