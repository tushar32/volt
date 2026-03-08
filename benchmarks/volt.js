/**
 * Benchmark Mode 2: Volt with SO_REUSEPORT
 * 
 * Uses worker_threads + SO_REUSEPORT.
 * Kernel distributes connections directly to workers.
 * Zero IPC overhead.
 */
import { VoltServer } from '../dist/index.js';
import { availableParallelism } from 'node:os';

const workerCount = parseInt(process.env.WORKERS) || availableParallelism();

const server = new VoltServer({
  app: './benchmarks/express-app.js',
  port: 3000,
  workers: workerCount,
  healthCheck: true,
  healthCheckPort: 9091,
  metrics: true,
  metricsPort: 9090,
  gracefulShutdown: 10_000,
  eventLoopInterval: 1000,
});

console.log(`[VOLT MODE] Starting with ${workerCount} workers (SO_REUSEPORT)`);
server.start();
