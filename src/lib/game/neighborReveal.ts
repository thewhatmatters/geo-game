/** Indices of a-z/A-Z characters within `name`, in randomized order (Fisher-Yates). */
export function shuffleLetterPositions(name: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < name.length; i++) {
    if (/[A-Za-z]/.test(name[i])) positions.push(i);
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions;
}

/**
 * Renders `name` with the first `revealCount` positions of `order` shown
 * (uppercased) and every other letter blanked as "_"; non-letter characters
 * (spaces, hyphens) always pass through unchanged.
 */
export function revealedNeighborName(name: string, order: number[], revealCount: number): string {
  const clamped = Math.max(0, Math.min(order.length, Math.round(revealCount)));
  const revealed = new Set(order.slice(0, clamped));
  return name
    .split("")
    .map((char, i) => (/[A-Za-z]/.test(char) ? (revealed.has(i) ? char.toUpperCase() : "_") : char))
    .join(" ");
}
