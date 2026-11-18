import test from 'node:test';
import assert from 'node:assert/strict';
import { planSimulatedPlacements } from '../src/services/simulated-rebalancer.js';

test('simulated placements distribute actors evenly and deterministically', () => {
  const actors = ['d', 'b', 'a', 'c', 'e'].map((actorId) => ({ actorId }));
  const workers = [{ workerId: 'worker-2' }, { workerId: 'worker-1' }];
  const placements = planSimulatedPlacements(actors, workers);
  const counts = Object.groupBy(placements, (item) => item.workerId);

  assert.deepEqual(
    placements.map(({ actor, workerId }) => [actor.actorId, workerId]),
    [
      ['a', 'worker-1'],
      ['b', 'worker-2'],
      ['c', 'worker-1'],
      ['d', 'worker-2'],
      ['e', 'worker-1'],
    ],
  );
  assert.equal(counts['worker-1'].length - counts['worker-2'].length, 1);
});

test('simulated placements remain stable when worker capacity is unchanged', () => {
  const actors = [
    { actorId: 'a', simulatedWorkerId: 'worker-1' },
    { actorId: 'b', simulatedWorkerId: 'worker-2' },
    { actorId: 'c', simulatedWorkerId: 'worker-1' },
    { actorId: 'd', simulatedWorkerId: 'worker-2' },
  ];
  const placements = planSimulatedPlacements(actors, [
    { workerId: 'worker-1' },
    { workerId: 'worker-2' },
  ]);
  assert.deepEqual(
    placements.map(({ workerId }) => workerId),
    ['worker-1', 'worker-2', 'worker-1', 'worker-2'],
  );
});

test('simulated placements clear when there are no virtual workers', () => {
  const placements = planSimulatedPlacements(
    [{ actorId: 'a', simulatedWorkerId: 'worker-1' }],
    [],
  );
  assert.deepEqual(
    placements.map(({ workerId }) => workerId),
    [null],
  );
});

test('simulated placements move actors off workers removed by scaling down', () => {
  const placements = planSimulatedPlacements(
    [
      { actorId: 'a', simulatedWorkerId: 'worker-1' },
      { actorId: 'b', simulatedWorkerId: 'worker-2' },
      { actorId: 'c', simulatedWorkerId: 'worker-3' },
      { actorId: 'd', simulatedWorkerId: 'worker-3' },
    ],
    [{ workerId: 'worker-1' }, { workerId: 'worker-2' }],
  );
  assert.deepEqual(
    placements.map(({ workerId }) => workerId),
    ['worker-1', 'worker-2', 'worker-1', 'worker-2'],
  );
});
