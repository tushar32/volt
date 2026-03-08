import type { ResolvedConfig } from '../config/config.js';
import { WorkerPool } from './worker-pool.js';
import { HealthMonitor } from './health-monitor.js';
import { MetricsCollector } from '../metrics/collector.js';

/**
 * Main thread Supervisor.
 *
 * Orchestrates everything that runs OUTSIDE of worker threads:
 *   - WorkerPool: spawning, crash recovery, rolling restarts
 *   - HealthMonitor: /health/live + /health/ready HTTP endpoints
 *   - MetricsCollector: Prometheus /metrics endpoint
 *   - Graceful shutdown on SIGTERM / SIGINT
 *
 * The supervisor is NOT in the request path — it's purely a manager.
 * All HTTP traffic flows directly to workers via SO_REUSEPORT.
 */
export class Supervisor {
  private config: ResolvedConfig;
  private workerPool: WorkerPool;
  private healthMonitor: HealthMonitor;
  private metricsCollector: MetricsCollector;
  private started = false;

  constructor(config: ResolvedConfig) {
    this.config = config;
    this.metricsCollector = new MetricsCollector();

    this.workerPool = new WorkerPool(config, this.metricsCollector, {
      onReady: (workerId) => {
        console.log(`[volt] Worker ${workerId} is ready`);
      },
      onExit: (workerId, code) => {
        if (code !== 0) {
          console.warn(`[volt] Worker ${workerId} exited with code ${code}`);
        }
      },
      onError: (workerId, error) => {
        console.error(`[volt] Worker ${workerId} error: ${error}`);
      },
    });

    this.healthMonitor = new HealthMonitor(
      this.workerPool,
      this.metricsCollector
    );
  }

  /**
   * Start the supervisor:
   *   1. Spawn all worker threads
   *   2. Start health check server
   *   3. Start metrics server
   *   4. Begin health ping loop
   */
  async start(): Promise<void> {
    if (this.started) return;

    console.log(
      `[volt] Starting supervisor — ${this.config.workers} workers on :${this.config.port}`
    );

    // 1. Spawn all workers (waits for all 'ready' signals)
    await this.workerPool.spawnAll();
    console.log(`[volt] All ${this.config.workers} workers ready`);

    // 2. Start health check server
    if (this.config.healthCheck) {
      await this.healthMonitor.start(this.config.healthCheckPort);
      console.log(
        `[volt] Health checks at http://0.0.0.0:${this.config.healthCheckPort}/health`
      );
    }

    // 3. Start Prometheus metrics server
    if (this.config.metrics) {
      await this.metricsCollector.startServer(this.config.metricsPort);
      console.log(
        `[volt] Prometheus metrics at http://0.0.0.0:${this.config.metricsPort}/metrics`
      );
    }

    // 4. Start periodic health pings
    this.healthMonitor.startPingLoop();

    this.started = true;

    console.log(
      `[volt] ⚡ Server running at http://${this.config.host}:${this.config.port}`
    );
  }

  /**
   * Graceful shutdown — called on SIGTERM / SIGINT.
   *
   * Sequence per Kubernetes best practices:
   *   1. Stop accepting new connections (drain workers)
   *   2. Wait for in-flight requests to complete (with timeout)
   *   3. Shut down health/metrics servers
   *   4. Exit cleanly
   */
  async shutdown(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    console.log('[volt] Starting graceful shutdown...');

    // Stop health and metrics servers first (K8s will stop sending traffic)
    await this.healthMonitor.stop();
    await this.metricsCollector.stopServer();

    // Shut down all workers gracefully
    await this.workerPool.shutdown(this.config.gracefulShutdown);

    console.log('[volt] Graceful shutdown complete');
  }

  /**
   * Rolling restart — zero-downtime worker replacement.
   * Restarts workers one at a time so traffic keeps flowing.
   */
  async rollingRestart(): Promise<void> {
    console.log('[volt] Starting rolling restart...');
    await this.workerPool.rollingRestart();
    console.log('[volt] Rolling restart complete');
  }

  /** Check if all workers are ready. */
  isReady(): boolean {
    return this.workerPool.allReady();
  }

  /** Get the metrics collector for external use. */
  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }
}
