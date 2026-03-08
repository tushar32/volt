import {
  performance,
  monitorEventLoopDelay,
  type EventLoopUtilization,
  type IntervalHistogram,
} from 'node:perf_hooks';
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

export class EventLoopMonitor {
  private eld: IntervalHistogram;
  private previousELU: EventLoopUtilization;
  private interval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onSample?: (metrics: WorkerMetrics) => void;
  private started = false;

  constructor(options: EventLoopMonitorOptions = {}) {
    this.interval = options.interval ?? 1000;
    this.onSample = options.onSample;

    // ELD: create histogram with configurable resolution
    // Lower resolution = more precise but higher overhead
    this.eld = monitorEventLoopDelay({
      resolution: options.resolution ?? 20,
    });

    // ELU: capture baseline for differential measurement
    this.previousELU = performance.eventLoopUtilization();
  }

  /** Start periodic sampling. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.eld.enable();

    this.timer = setInterval(() => {
      const metrics = this.sample();
      this.onSample?.(metrics);
    }, this.interval);

    // Don't keep the process alive just for monitoring
    this.timer.unref();
  }

  /** Stop sampling and clean up. */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.eld.disable();
  }

  /**
   * Take a single sample.
   * ELU is measured differentially since the last sample.
   * ELD histogram is reset after each sample for a clean window.
   */
  sample(): WorkerMetrics {
    // ELU: differential since last sample
    const elu = performance.eventLoopUtilization(this.previousELU);
    this.previousELU = performance.eventLoopUtilization();

    // ELD: read histogram and reset
    const mem = process.memoryUsage();

    const metrics: WorkerMetrics = {
      elu: elu.utilization,
      eld: {
        min: nsToMs(this.eld.min),
        max: nsToMs(this.eld.max),
        mean: nsToMs(this.eld.mean),
        p50: nsToMs(this.eld.percentile(50)),
        p99: nsToMs(this.eld.percentile(99)),
      },
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      timestamp: Date.now(),
    };

    // Reset ELD for a fresh window on next sample
    this.eld.reset();

    return metrics;
  }

  /** Get current ELU without resetting (for on-demand checks). */
  getCurrentELU(): number {
    return performance.eventLoopUtilization(this.previousELU).utilization;
  }
}

/** Convert nanoseconds to milliseconds with 2 decimal precision. */
function nsToMs(ns: number): number {
  return Math.round((ns / 1e6) * 100) / 100;
}
