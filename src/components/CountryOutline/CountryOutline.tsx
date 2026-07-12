import { motion } from "framer-motion";

export interface CountryOutlineProps {
  /** SVG path string for the country, in the 200x200 viewBox produced by scripts/generate-countries-geo.mjs */
  path: string;
  /** How much of the outline should be drawn, 0-100. */
  completion: number;
  className?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export function CountryOutline({
  path,
  completion,
  className,
  strokeColor = "currentColor",
  strokeWidth = 1.5,
}: CountryOutlineProps) {
  const pathLength = Math.min(100, Math.max(0, completion)) / 100;

  return (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
      <motion.path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength, pathSpacing: 1 }}
        transition={{ duration: 0.3, ease: "linear" }}
      />
    </svg>
  );
}
