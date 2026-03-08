import type { WorkerMetrics } from '../config/config.js';
/**
 * Collects and aggregates metrics from all worker threads.
 * Exposes them as Prometheus-compatible text at /metrics.
 *
 * Runs on the main (supervisor) thread — survives worker crashes.
 */
export declare class MetricsCollector {
    private workerMetrics;
    private server;
    /** Record a metrics report from a worker. */
    record(workerId: number, metrics: WorkerMetrics): void;
    /** Remove metrics for a terminated worker. */
    remove(workerId: number): void;
    /** Get the latest metrics snapshot for all workers. */
    getAll(): Map<number, WorkerMetrics>;
    /** Get average ELU across all workers. */
    getAverageELU(): number;
    /** Get max ELU across all workers. */
    getMaxELU(): number;
    /** Get max ELD p99 across all workers. */
    getMaxELDp99(): number;
    /**
     * Start the Prometheus metrics HTTP server.
     * Separate port from the app — not behind SO_REUSEPORT.
     */
    startServer(port: number): Promise<void>;
    /** Stop the metrics server. */
    stopServer(): Promise<void>;
    /** Format all metrics as Prometheus text exposition format. */
    private formatPrometheus;
}
//# sourceMappingURL=collector.d.ts.map