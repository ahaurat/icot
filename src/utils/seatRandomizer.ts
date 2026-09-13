export interface SeatedStudent {
  id: string;
  seatIndex: number;
}

/**
 * Shuffle which student sits where, keeping the exact same set of occupied
 * seat indices — nobody moves to a currently-empty desk, nobody's seat count
 * changes, only who sits where.
 */
export function shuffleSeats(seated: SeatedStudent[]): SeatedStudent[] {
  const indices = seated.map((s) => s.seatIndex).sort((a, b) => a - b);
  const ids = seated.map((s) => s.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.map((id, i) => ({ id, seatIndex: indices[i] }));
}
