import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/database.js';
import mongoose from 'mongoose';
import { connectRedis, redis } from './config/redis.js';
import { rebalance, rebalanceMinimumWorkers } from './services/runtime.js';

const singleServiceMode = process.argv.includes('--single-service');

if (process.argv.includes('--worker')) {
  const { startWorker } = await import('./runtime/worker.js');
  await startWorker();
} else {
  try {
    await connectDatabase();
  } catch (error) {
    console.error(
      `MongoDB unavailable; database-backed routes are disabled until it returns: ${error.message}`,
    );
  }
  try {
    await connectRedis();
  } catch (error) {
    console.error(
      `Redis unavailable; coordination-backed routes are disabled until it returns: ${error.message}`,
    );
  }
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () =>
    console.log(`ActorLab API listening on http://localhost:${port}`),
  );
  if (singleServiceMode) {
    process.env.WORKER_ID ||= 'actorlab-render-worker-1';
    process.env.WORKER_PORT ||= '3101';
    process.env.WORKER_ADVERTISE_HOST ||= '127.0.0.1';
    process.env.COORDINATOR_URL ||= `http://127.0.0.1:${port}`;
    const launchWorker = async () => {
      try {
        const { startWorker } = await import('./runtime/worker.js');
        await startWorker();
      } catch (error) {
        console.error(`Worker startup failed; retrying in 5s: ${error.message}`);
        setTimeout(launchWorker, 5000).unref?.();
      }
    };
    launchWorker();
    console.log('Single-service mode enabled; actor worker will run in this web process.');
  }
  const retryTimer = setInterval(() => {
    if (mongoose.connection.readyState !== 1) connectDatabase().catch(() => {});
    if (!redis.isReady && !redis.isOpen) connectRedis().catch(() => {});
  }, 5000);
  const rebalanceTimer = setInterval(
    () => {
      if (redis.isReady)
        rebalance().catch((error) => {
          if (error.status !== 409)
            console.error('Automatic rebalance failed:', error.message);
        });
    },
    Number(process.env.AUTO_REBALANCE_INTERVAL_MS || 10000),
  );
  console.log(
    `Automatic balancing enabled: every ${Number(process.env.AUTO_REBALANCE_INTERVAL_MS || 10000) / 1000}s with a ${rebalanceMinimumWorkers}-worker threshold`,
  );
  const shutdown = () => {
    clearInterval(retryTimer);
    clearInterval(rebalanceTimer);
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
