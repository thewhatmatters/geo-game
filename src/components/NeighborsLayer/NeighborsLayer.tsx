import { CountryPath } from "../CountryOutline";
import type { NeighborSlot } from "../../lib/geo/scene";
import { useNeighborReveal } from "../../lib/game/useNeighborReveal";
import { viewBoxToBounds } from "../../lib/geo/pathBounds";
import { layoutLabels, type LabelCandidate } from "../../lib/geo/labelLayout";

/** Faint, muted stroke/label color for neighbor outlines — visually secondary to the target's full-white outline, rather than relying on element opacity. */
const NEIGHBOR_COLOR = "rgba(255, 255, 255, 0.4)";

export interface NeighborsLayerProps {
  slots: NeighborSlot[];
  visible: boolean;
  completion: number;
  /** Stroke width and label font size in viewBox user-units (pre-scaled by the parent scene's pxScale so they read as a consistent on-screen size regardless of the target's true size). */
  strokeWidth: number;
  labelFontSize: number;
  /** The scene's viewBox string — labels are clamped to stay inside it, not just the neighbor's own visible bounds. */
  viewBox: string;
}

/**
 * Renders up to 3 neighbor outlines as children of the scene's shared <svg>
 * (see App.tsx / computeGeoScene), at their true relative position and
 * scale to the target — borders line up because every path comes from the
 * same shared-world-frame projection, not an approximated compass position.
 * Hidden until the staggered-onset threshold (US-008). Fewer than 3
 * neighbors (including 0, for islands) simply renders fewer — no
 * placeholder or error.
 */
export function NeighborsLayer({ slots, visible, completion, strokeWidth, labelFontSize, viewBox }: NeighborsLayerProps) {
  const reveals = useNeighborReveal(slots, completion);

  if (!visible || slots.length === 0) return null;

  const frame = viewBoxToBounds(viewBox);
  const xMargin = labelFontSize;
  const yMargin = labelFontSize * 0.75;

  // Center each label on the VISIBLE portion of its country, not the full
  // true bounding box (a large neighbor like Brazil can extend far outside
  // the viewBox, which would otherwise push a bounds-centered label off
  // frame entirely), then clamp the offset placement back inside the frame.
  const rawCandidates: LabelCandidate[] = [];
  slots.forEach((slot, i) => {
    const vb = slot.visibleBounds;
    if (!vb) return;
    rawCandidates.push({
      code: slot.code,
      text: reveals[i].displayName,
      x: Math.min(Math.max((vb.minX + vb.maxX) / 2, frame.minX + xMargin), frame.maxX - xMargin),
      y: Math.min(vb.maxY + labelFontSize * 1.5, frame.maxY - yMargin),
    });
  });

  // Multiple neighbors can all be tiny slivers clamped near the same
  // corner (e.g. two large neighbors both mostly off-frame) — nudge their
  // labels apart vertically rather than letting them overlap.
  const labels = layoutLabels(rawCandidates, frame, labelFontSize);
  const labelByCode = new Map(labels.map((l) => [l.code, l]));

  return (
    <g data-testid="neighbors-layer">
      {slots.map((slot) => {
        const label = labelByCode.get(slot.code);

        return (
          <g key={slot.code} data-testid={`neighbor-${slot.code}`}>
            <CountryPath
              path={slot.country.path}
              completion={completion}
              strokeWidth={strokeWidth}
              strokeColor={NEIGHBOR_COLOR}
            />
            {label && (
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                fontSize={labelFontSize}
                fontWeight={600}
                fill={NEIGHBOR_COLOR}
                data-testid={`neighbor-name-${slot.code}`}
              >
                {label.text}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
