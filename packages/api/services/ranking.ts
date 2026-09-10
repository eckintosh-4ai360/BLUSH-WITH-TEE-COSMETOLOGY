// Positions from marks.
export function positionsByScore(scores: Array<number | null>): Array<number | null> {
  const marked = scores
    .map((score, index) => ({ score, index }))
    .filter((row): row is { score: number; index: number } => row.score !== null)
    .sort((a, b) => b.score - a.score);

  const positions: Array<number | null> = scores.map(() => null);

  let previousScore: number | null = null;
  let previousPosition = 0;

  marked.forEach((row, rank) => {
    // The tie shares the leader's position.
    const position = row.score === previousScore ? previousPosition : rank + 1;
    positions[row.index] = position;
    previousScore = row.score;
    previousPosition = position;
  });

  return positions;
}

// How many share each position, so a sheet can say "2nd (tied)".
export function tiedPositions(positions: Array<number | null>): Set<number> {
  const seen = new Map<number, number>();
  for (const position of positions) {
    if (position === null) continue;
    seen.set(position, (seen.get(position) ?? 0) + 1);
  }

  const tied = new Set<number>();
  for (const [position, held] of seen) if (held > 1) tied.add(position);
  return tied;
}

// "1st", "2nd", "3rd", "4th" - the suffix English actually uses.
export function ordinal(position: number): string {
  const lastTwo = position % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`;

  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}
