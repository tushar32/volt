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
export declare class HealthMonitor {
    private server;
    private workerPool;
    private metricsCollector;
    private pingTimer;
    constructor(workerPool: WorkerPool, metricsCollector: MetricsCollector);
    /**
     * Start the health check HTTP server.
     */
    start(port: number): Promise<void>;
    /**
     * Start periodic worker pings for health verification.
     */
    startPingLoop(intervalMs?: number): void;
    /**
     * Stop the health check server and ping loop.
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=health-monitor.d.ts.map