import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import type { ResolvedConfig } from '../config/config.js';

/**
 * Windows / non-SO_REUSEPORT fallback using the cluster module.
 *
 * Uses the standard Node.js cluster pattern:
 *   Primary → forks N child processes
 *   Each child → calls create() and listens on the same port
 *   The cluster module distributes connections via IPC (round-robin on most OS)
 *
 * This has ~30% more overhead than SO_REUSEPORT but works everywhere.
 */
export async function startWithCluster(config: ResolvedConfig): Promise<void> {
  if (cluster.isPrimary) {
    console.log(
      `[volt] SO_REUSEPORT not available — using cluster mode (${config.workers} workers)`
    );

    const workers = new Map<number, ReturnType<typeof cluster.fork>>();

    for (let i = 0; i < config.workers; i++) {
      const worker = cluster.fork({
        VOLT_WORKER_ID: String(i),
        VOLT_APP_PATH: config.app,
        VOLT_PORT: String(config.port),
        VOLT_HOST: String(config.host),
      });
      workers.set(i, worker);
    }

    // Auto-restart crashed workers
    cluster.on('exit', (worker, code, signal) => {
      if (code !== 0) {
        console.error(
          `[volt] Cluster worker ${worker.process.pid} exited (code=${code}, signal=${signal}), restarting...`
        );
        const id = [...workers.entries()].find(
          ([, w]) => w === worker
        )?.[0];
        if (id !== undefined) {
          const replacement = cluster.fork({
            VOLT_WORKER_ID: String(id),
            VOLT_APP_PATH: config.app,
            VOLT_PORT: String(config.port),
            VOLT_HOST: String(config.host),
          });
          workers.set(id, replacement);
        }
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('[volt] Shutting down cluster workers...');
      for (const [, worker] of workers) {
        worker.send({ type: 'shutdown' });
      }
      setTimeout(() => {
        console.error('[volt] Cluster shutdown timeout — forcing exit');
        process.exit(1);
      }, config.gracefulShutdown).unref();
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } else {
    // Cluster worker process
    const appPath = process.env.VOLT_APP_PATH!;
    const port = parseInt(process.env.VOLT_PORT!, 10);
    const host = process.env.VOLT_HOST!;
    const workerId = parseInt(process.env.VOLT_WORKER_ID!, 10);

    const absolutePath = resolve(process.cwd(), appPath);
    const appModule = await import(absolutePath);

    const create =
      typeof appModule.create === 'function'
        ? appModule.create
        : typeof appModule.default?.create === 'function'
          ? appModule.default.create
          : typeof appModule.default === 'function'
            ? appModule.default
            : null;

    if (!create) {
      console.error(
        `[volt] Worker ${workerId}: app module must export a create() function`
      );
      process.exit(1);
    }

    const server = await create();

    server.listen({ port, host }, () => {
      console.log(
        `[volt] Cluster worker ${workerId} (pid=${process.pid}) listening on ${host}:${port}`
      );
    });

    // Handle shutdown message from primary
    process.on('message', (msg: any) => {
      if (msg?.type === 'shutdown') {
        server.close(() => process.exit(0));
      }
    });
  }
}
