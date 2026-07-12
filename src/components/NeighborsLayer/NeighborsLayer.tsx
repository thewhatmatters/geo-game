import { CountryOutline } from "../CountryOutline";
import { anchorVector } from "../../lib/geo/compass";
import type { NeighborSlot } from "../../lib/geo/compass";

export interface NeighborsLayerProps {
  slots: NeighborSlot[];
  visible: boolean;
  completion: number;
  /** Distance in px from the target's center each neighbor slot is offset. */
  radius?: number;
}

/**
 * Positions up to 3 neighbor CountryOutlines at their real-world compass
 * direction relative to the target, hidden until the staggered-onset
 * threshold (US-008). Fewer than 3 neighbors (including 0, for islands)
 * simply renders fewer slots — no placeholder or error.
 */
export function NeighborsLayer({ slots, visible, completion, radius = 130 }: NeighborsLayerProps) {
  if (!visible || slots.length === 0) return null;

  return (
    <div className="neighbors-layer" data-testid="neighbors-layer">
      {slots.map((slot) => {
        const { dx, dy } = anchorVector(slot.anchor);
        return (
          <div
            key={slot.code}
            className="neighbors-layer__slot"
            data-testid={`neighbor-${slot.code}`}
            data-anchor={slot.anchor}
            style={{ transform: `translate(${dx * radius}px, ${dy * radius}px)` }}
          >
            <CountryOutline
              path={slot.country.path}
              completion={completion}
              className="neighbors-layer__outline"
            />
          </div>
        );
      })}
    </div>
  );
}
