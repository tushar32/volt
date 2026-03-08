import { performance, monitorEventLoopDelay, } from 'node:perf_hooks';
export class EventLoopMonitor {
    eld;
    previousELU;
    interval;
    timer = null;
    onSample;
    started = false;
    constructor(options = {}) {
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
    start() {
        if (this.started)
            return;
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
    stop() {
        if (!this.started)
            return;
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
    sample() {
        // ELU: differential since last sample
        const elu = performance.eventLoopUtilization(this.previousELU);
        this.previousELU = performance.eventLoopUtilization();
        // ELD: read histogram and reset
        const mem = process.memoryUsage();
        const metrics = {
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
    getCurrentELU() {
        return performance.eventLoopUtilization(this.previousELU).utilization;
    }
}
/** Convert nanoseconds to milliseconds with 2 decimal precision. */
function nsToMs(ns) {
    return Math.round((ns / 1e6) * 100) / 100;
}
//# sourceMappingURL=eventloop-lag.js.map