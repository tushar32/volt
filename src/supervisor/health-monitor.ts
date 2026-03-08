import { createServer, type Server } from 'node:http';
import type { WorkerPool } from './worker-pool.js';
import type { MetricsCollector } from '../metrics/collector.js';

/**
 * Health check HTTP server — runs on the supervisor (main thread).
 *
 * Exposes two endpoints for Kubernetes probes:
 *   GET /health/live   → Is the supervisor process alive? (liveness)
 *   GET /health/ready  → Are all workers ready? (readiness)
 *
 * Runs on a SEPARATE port from the app (not behind SO_REUSEPORT).
 * This ensures health checks work even if all workers are down.
 */
export class HealthMonitor {
  private server: Server | null = null;
  private workerPool: WorkerPool;
  private metricsCollector: MetricsCollector;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(workerPool: WorkerPool, metricsCollector: MetricsCollector) {
    this.workerPool = workerPool;
    this.metricsCollector = metricsCollector;
  }

  /**
   * Start the health check HTTP server.
   */
  async start(port: number): Promise<void> {
    this.server = createServer((req, res) => {
      const url = req.url ?? '';

      if (url === '/health/live') {
        // Liveness: is the supervisor process alive?
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'alive' }));
        return;
      }

      if (url === '/health/ready') {
        // Readiness: are all workers ready to serve traffic?
        const allReady = this.workerPool.allReady();
        const ready = this.workerPool.readyCount();
        const total = this.workerPool.totalCount();

        const statusCode = allReady ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: allReady ? 'ready' : 'not_ready',
            workers: { ready, total },
            avgELU: this.metricsCollector.getAverageELU().toFixed(4),
            maxELDp99: this.metricsCollector.getMaxELDp99().toFixed(2),
          })
        );
        return;
      }

      if (url === '/health') {
        // Combined health overview
        const allReady = this.workerPool.allReady();
        const ready = this.workerPool.readyCount();
        const total = this.workerPool.totalCount();
        const avgELU = this.metricsCollector.getAverageELU();
        const maxP99 = this.metricsCollector.getMaxELDp99();

        const status = !allReady
          ? 'unhealthy'
          : avgELU > 0.9
            ? 'degraded'
            : 'healthy';

        const statusCode = status === 'unhealthy' ? 503 : 200;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status,
            uptime: process.uptime(),
            workers: { ready, total },
            eventLoop: {
              avgELU: Number(avgELU.toFixed(4)),
              maxELDp99ms: Number(maxP99.toFixed(2)),
            },
          })
        );
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.on('error', reject);
      this.server!.listen(port, '0.0.0.0', () => {
        this.server!.removeListener('error', reject);
        resolve();
      });
    });
  }

  /**
   * Start periodic worker pings for health verification.
   */
  startPingLoop(intervalMs: number = 5000): void {
    this.pingTimer = setInterval(() => {
      this.workerPool.pingAll();
    }, intervalMs);
    this.pingTimer.unref();
  }

  /**
   * Stop the health check server and ping loop.
   */
  async stop(): Promise<void> {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (!this.server) return;
    return new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
  }
}
