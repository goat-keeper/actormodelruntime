/**
 * Plan deterministic, display-only placements over virtual workers.
 * Actor IDs and worker IDs are sorted so repeated plans are stable.
 */
export function planSimulatedPlacements(actors, workers) {
  const orderedActors = [...actors].sort((a, b) =>
    a.actorId.localeCompare(b.actorId),
  );
  const orderedWorkers = [...workers].sort((a, b) =>
    a.workerId.localeCompare(b.workerId),
  );
  if (!orderedWorkers.length)
    return orderedActors.map((actor) => ({ actor, workerId: null }));

  const counts = new Map(orderedWorkers.map((worker) => [worker.workerId, 0]));
  const placements = [];
  for (const actor of orderedActors) {
    const current = actor.simulatedWorkerId;
    const currentCount = counts.get(current);
    const leastLoaded = orderedWorkers.reduce((best, worker) =>
      counts.get(worker.workerId) < counts.get(best.workerId) ? worker : best,
    );
    const target =
      currentCount !== undefined &&
      currentCount <= counts.get(leastLoaded.workerId)
        ? current
        : leastLoaded.workerId;
    placements.push({ actor, workerId: target });
    counts.set(target, counts.get(target) + 1);
  }
  return placements;
}
