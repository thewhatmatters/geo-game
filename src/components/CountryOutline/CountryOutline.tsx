import { motion } from "framer-motion";
import { pathBounds, boundsToViewBox } from "../../lib/geo/pathBounds";

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
  const pathLength = Math.min(100, Math.max(0, completion)) / 100;

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
      transition={{ duration: 0.3, ease: "linear" }}
      style={{ transition: "fill 0.6s ease" }}
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
