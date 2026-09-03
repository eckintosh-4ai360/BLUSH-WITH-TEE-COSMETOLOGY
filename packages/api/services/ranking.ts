/**
 * Positions from marks.
 *
 * A school reports a position, not a sort order, and the two differ the moment
 * two students score the same: they are joint second, and nobody is third.
 * That is standard competition ranking - the shared position is repeated and
 * the next distinct score skips the places used up by the tie - and it is the
 * convention a printed result sheet is read against.
 *
 * Kept pure and index-aligned so the rule can be read and tested on its own,
 * without an assessment, a roster or a database. Nothing here is stored: a
 * position is worked out from the marks every time they are read, because a
 * stored one silently becomes a lie the first time a mark is corrected.
 */

/**
 * Positions for `scores`, in the same order.
 *
 * `null` in means `null` out: a student who has not been marked yet has no
 * position, rather than sharing last place with everybody else unmarked. They
 * also do not consume a place, so marking the rest of the room does not move
 * anyone once the missing marks arrive.
 */
export function positionsByScore(scores: Array<number | null>): Array<number | null> {
  const marked = scores
    .map((score, index) => ({ score, index }))
    .filter((row): row is { score: number; index: number } => row.score !== null)
    .sort((a, b) => b.score - a.score);

  const positions: Array<number | null> = scores.map(() => null);

  let previousScore: number | null = null;
  let previousPosition = 0;

  marked.forEach((row, rank) => {
    // The tie shares the leader's position; the next distinct score takes the
    // place its own rank has reached, not the one after the tie.
    const position = row.score === previousScore ? previousPosition : rank + 1;
    positions[row.index] = position;
    previousScore = row.score;
    previousPosition = position;
  });

  return positions;
}

/**
 * How many share each position, so a sheet can say "2nd (tied)".
 *
 * A position held alone is not worth remarking on, so only shared ones are
 * counted here - a caller checks membership rather than comparing to one.
 */
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

/** "1st", "2nd", "3rd", "4th" - the suffix English actually uses. */
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
