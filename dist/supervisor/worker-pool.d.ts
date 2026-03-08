import { Worker } from 'node:worker_threads';
import type { ResolvedConfig } from '../config/config.js';
import { MetricsCollector } from '../metrics/collector.js';
export type WorkerStatus = 'starting' | 'ready' | 'stopping' | 'exited';
export interface ManagedWorker {
    id: number;
    worker: Worker;
    status: WorkerStatus;
    startTime: number;
    crashCount: number;
}
export interface WorkerPoolEvents {
    onReady: (workerId: number) => void;
    onExit: (workerId: number, code: number | null) => void;
    onError: (workerId: number, error: string) => void;
}
/**
 * Manages the lifecycle of worker threads:
 *   - Spawning with workerData (app path, port, SO_REUSEPORT flag)
 *   - Auto-restarting on crash with exponential backoff
 *   - Handling worker messages (ready, metrics, shutdown-complete)
 *   - Draining and graceful shutdown of all workers
 */
export declare class WorkerPool {
    private workers;
    private config;
    private metricsCollector;
    private events;
    private shuttingDown;
    private reusePort;
    constructor(config: ResolvedConfig, metricsCollector: MetricsCollector, events: WorkerPoolEvents);
    /**
     * Spawn all configured workers.
     * Returns when all workers have sent the 'ready' message.
     */
    spawnAll(): Promise<void>;
    /**
     * Spawn a single worker thread and wait for its 'ready' signal.
     */
    spawnWorker(id: number): Promise<void>;
    /**
     * Graceful shutdown: signal all workers, wait for confirmation.
     */
    shutdown(timeoutMs: number): Promise<void>;
    /**
     * Rolling restart: restart workers one at a time to maintain availability.
     */
    rollingRestart(): Promise<void>;
    /** Check if all workers are ready. */
    allReady(): boolean;
    /** Get the number of ready workers. */
    readyCount(): number;
    /** Get total worker count. */
    totalCount(): number;
    /** Ping all workers (for health checks). */
    pingAll(): void;
    private handleMessage;
    private waitForExit;
}
//# sourceMappingURL=worker-pool.d.ts.map