const apiUrl = process.env.API_URL || 'http://actorlab-api:3000/api';
const concurrency = Math.min(
  64,
  Math.max(1, Number(process.env.SIMULATOR_CONCURRENCY || 8)),
);

async function request(path, options) {
  const response = await fetch(`${apiUrl}${path}`, options);
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

let actors;
while (!actors?.length) {
  try {
    actors = (await request('/actors')).filter(
      (actor) => actor.actorType === 'CounterActor',
    );
  } catch (error) {
    console.error(`Waiting for API and seeded CounterActors: ${error.message}`);
  }
  if (!actors?.length) await new Promise((resolve) => setTimeout(resolve, 3000));
}

console.log(
  `Load simulator sending counter increments with ${concurrency} concurrent clients across ${actors.length} actors`,
);
let completed = 0;
let failed = 0;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
  });

async function client(index) {
  while (!stopping) {
    const actor = actors[(index + Math.floor(Math.random() * actors.length)) % actors.length];
    try {
      await request(`/actors/${encodeURIComponent(actor.actorId)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'increment', payload: { amount: 1 } }),
      });
      completed += 1;
    } catch (error) {
      failed += 1;
      if (failed % 20 === 1) console.error(`Load request failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

setInterval(() => {
  console.log(`Load simulator: ${completed} successful, ${failed} failed requests`);
  completed = 0;
  failed = 0;
}, 10000).unref();

await Promise.all(Array.from({ length: concurrency }, (_, index) => client(index)));
