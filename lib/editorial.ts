export function scheduleReview(pairs: readonly (readonly string[])[]) {
  const unique = new Set<string>(),
    neighbors = new Map<string, Set<string>>();
  let duplicates = 0;
  for (const [a, b] of pairs) {
    const key = [a, b].sort().join("|");
    if (unique.has(key)) duplicates++;
    unique.add(key);
    for (const [song, opponent] of [
      [a, b],
      [b, a],
    ]) {
      if (!neighbors.has(song)) neighbors.set(song, new Set());
      neighbors.get(song)!.add(opponent);
    }
  }
  const seen = new Set<string>();
  let groups = 0;
  for (const song of neighbors.keys()) {
    if (seen.has(song)) continue;
    groups++;
    const pending = [song];
    while (pending.length) {
      const next = pending.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      pending.push(...neighbors.get(next)!);
    }
  }
  return {
    duplicates,
    fewOpponents: [...neighbors.values()].filter((n) => n.size < 2).length,
    groups,
    songs: neighbors.size,
  };
}
