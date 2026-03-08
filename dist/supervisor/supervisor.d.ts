import type { ResolvedConfig } from '../config/config.js';
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
export declare class Supervisor {
    private config;
    private workerPool;
    private healthMonitor;
    private metricsCollector;
    private started;
    constructor(config: ResolvedConfig);
    /**
     * Start the supervisor:
     *   1. Spawn all worker threads
     *   2. Start health check server
     *   3. Start metrics server
     *   4. Begin health ping loop
     */
    start(): Promise<void>;
    /**
     * Graceful shutdown — called on SIGTERM / SIGINT.
     *
     * Sequence per Kubernetes best practices:
     *   1. Stop accepting new connections (drain workers)
     *   2. Wait for in-flight requests to complete (with timeout)
     *   3. Shut down health/metrics servers
     *   4. Exit cleanly
     */
    shutdown(): Promise<void>;
    /**
     * Rolling restart — zero-downtime worker replacement.
     * Restarts workers one at a time so traffic keeps flowing.
     */
    rollingRestart(): Promise<void>;
    /** Check if all workers are ready. */
    isReady(): boolean;
    /** Get the metrics collector for external use. */
    getMetricsCollector(): MetricsCollector;
}
//# sourceMappingURL=supervisor.d.ts.map