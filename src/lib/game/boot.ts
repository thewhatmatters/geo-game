import { getDailyCountry } from "./dailyCountry";
import type { DailySelection } from "./dailyCountry";
import { computeGeoScene } from "../geo/scene";
import type { GeoScene } from "../geo/scene";
import { getDayNumber } from "../share";

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Everything a round needs that depends on the two load-time inputs (the
 * date and the viewport) — resolved once at boot, then passed down as a
 * plain prop. Nothing below this seam reads the wall clock or `window`.
 */
export interface RoundBoot {
  /** Local YYYY-MM-DD puzzle identity; every date-keyed subsystem consumes this exact value. */
  date: string;
  daily: DailySelection;
  scene: GeoScene;
  dayNumber: number;
  /** The load-time viewport — App needs the real height for the vertical world-edge clamp (see scene.ts clampWorldCenterY). */
  viewport: ViewportSize;
}

/**
 * The app's single composition point for "today": main.tsx calls it with
 * the real date/viewport, tests call it with a frozen date and a fixed
 * viewport. The scene is deliberately computed once per load — resizing
 * re-centers panels but never re-projects (see App's layout effect).
 *
 * The max(width, height) is the cover-behavior conversion: the scene's
 * <svg> fills the viewport via preserveAspectRatio="xMidYMid slice"
 * (CSS background-size: cover), so its true on-screen size is the LARGER
 * viewport dimension. That knowledge lives here, behind the seam, not at
 * call sites.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Resolve the one calendar identity at the boot seam. A valid dev override
 * deliberately wins over the device clock; invalid values fall back locally. */
export function resolveBootDate(date: Date, dateOverride?: string | null): string {
  if (dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    const [year, month, day] = dateOverride.split("-").map(Number);
    const candidate = new Date(year, month - 1, day);
    if (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day
    ) return dateOverride;
  }
  return toLocalDateString(date);
}

export function bootRound(
  date: Date,
  viewport: ViewportSize,
  dateOverride?: string | null,
): RoundBoot {
  const localDate = resolveBootDate(date, dateOverride);
  const daily = getDailyCountry(localDate);
  const scene = computeGeoScene(daily, Math.max(viewport.width, viewport.height), viewport.height);
  return { date: localDate, daily, scene, dayNumber: getDayNumber(localDate), viewport };
}
