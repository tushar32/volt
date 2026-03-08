import type { WorkerMetrics } from '../config/config.js';
/**
 * Event Loop Monitor — runs inside each worker thread.
 *
 * Uses two official Node.js APIs:
 *
 * 1. **ELU** (Event Loop Utilization) via `performance.eventLoopUtilization()`
 *    - Returns a ratio 0–1 of how busy the event loop is
 *    - 0 = completely idle, 1 = fully saturated
 *    - This is the PRIMARY metric for scaling decisions
 *    - Differential measurement: compares two snapshots to get
 *      utilization over a specific interval
 *
 * 2. **ELD** (Event Loop Delay) via `monitorEventLoopDelay()`
 *    - High-resolution histogram of event loop delays
 *    - Captures how long callbacks wait in the queue
 *    - Values in nanoseconds, converted to ms
 *    - p99 is used for health checks and SLA monitoring
 *
 * Why ELU > CPU% for Node.js:
 *   CPU% can read 40% while the event loop is fully blocked on a
 *   single long-running operation. ELU accurately measures whether
 *   the loop is actually processing vs waiting for I/O.
 */
export interface EventLoopMonitorOptions {
    /** Sampling interval in ms (default: 1000) */
    interval?: number;
    /** ELD histogram resolution in ms (default: 20) */
    resolution?: number;
    /** Callback on each sample */
    onSample?: (metrics: WorkerMetrics) => void;
}
export declare class EventLoopMonitor {
    private eld;
    private previousELU;
    private interval;
    private timer;
    private onSample?;
    private started;
    constructor(options?: EventLoopMonitorOptions);
    /** Start periodic sampling. */
    start(): void;
    /** Stop sampling and clean up. */
    stop(): void;
    /**
     * Take a single sample.
     * ELU is measured differentially since the last sample.
     * ELD histogram is reset after each sample for a clean window.
     */
    sample(): WorkerMetrics;
    /** Get current ELU without resetting (for on-demand checks). */
    getCurrentELU(): number;
}
//# sourceMappingURL=eventloop-lag.d.ts.map