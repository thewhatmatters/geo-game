import type { Bounds } from "./pathBounds";

export interface LabelCandidate {
  code: string;
  text: string;
  x: number;
  y: number;
}

/**
 * Nudges labels apart when two would visually overlap — this happens when
 * multiple neighbors are all tiny slivers clamped near the same corner of
 * the viewBox (see NeighborsLayer). Processes candidates in order; each new
 * label is checked against already-placed ones and, on collision, offset
 * vertically by increasing multiples of a line height (alternating up/down)
 * until it clears or a bounded number of attempts is exhausted. Label width
 * is approximated from character count rather than measured DOM text, which
 * is enough to resolve real overlaps without needing a layout pass.
 */
export function layoutLabels(candidates: LabelCandidate[], frame: Bounds, fontSize: number): LabelCandidate[] {
  const lineHeight = fontSize * 1.3;
  const avgCharWidth = fontSize * 0.62;
  const halfWidthOf = (text: string) => (text.length * avgCharWidth) / 2;
  const minY = frame.minY + fontSize * 0.75;
  const maxY = frame.maxY - fontSize * 0.75;

  const placed: LabelCandidate[] = [];

  for (const candidate of candidates) {
    let y = candidate.y;
    const halfWidth = halfWidthOf(candidate.text);

    for (let attempt = 0; attempt < 6; attempt++) {
      const collides = placed.some((p) => {
        const xOverlap = Math.abs(candidate.x - p.x) < halfWidth + halfWidthOf(p.text);
        const yOverlap = Math.abs(y - p.y) < lineHeight;
        return xOverlap && yOverlap;
      });
      if (!collides) break;

      const direction = attempt % 2 === 0 ? -1 : 1;
      const magnitude = Math.ceil((attempt + 1) / 2);
      y = Math.min(Math.max(candidate.y + direction * magnitude * lineHeight, minY), maxY);
    }

    placed.push({ ...candidate, y });
  }

  return placed;
}
