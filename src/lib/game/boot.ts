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
  /** The date the puzzle was booted for — also the day the streak records against, so puzzle day and streak day can't disagree across midnight. */
  date: Date;
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
export function bootRound(date: Date, viewport: ViewportSize): RoundBoot {
  const daily = getDailyCountry(date);
  const scene = computeGeoScene(daily, Math.max(viewport.width, viewport.height), viewport.height);
  return { date, daily, scene, dayNumber: getDayNumber(date), viewport };
}
