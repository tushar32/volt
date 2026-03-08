import { createServer } from 'node:http';
/**
 * Collects and aggregates metrics from all worker threads.
 * Exposes them as Prometheus-compatible text at /metrics.
 *
 * Runs on the main (supervisor) thread — survives worker crashes.
 */
export class MetricsCollector {
    workerMetrics = new Map();
    server = null;
    /** Record a metrics report from a worker. */
    record(workerId, metrics) {
        this.workerMetrics.set(workerId, metrics);
    }
    /** Remove metrics for a terminated worker. */
    remove(workerId) {
        this.workerMetrics.delete(workerId);
    }
    /** Get the latest metrics snapshot for all workers. */
    getAll() {
        return new Map(this.workerMetrics);
    }
    /** Get average ELU across all workers. */
    getAverageELU() {
        if (this.workerMetrics.size === 0)
            return 0;
        let sum = 0;
        for (const m of this.workerMetrics.values()) {
            sum += m.elu;
        }
        return sum / this.workerMetrics.size;
    }
    /** Get max ELU across all workers. */
    getMaxELU() {
        let max = 0;
        for (const m of this.workerMetrics.values()) {
            if (m.elu > max)
                max = m.elu;
        }
        return max;
    }
    /** Get max ELD p99 across all workers. */
    getMaxELDp99() {
        let max = 0;
        for (const m of this.workerMetrics.values()) {
            if (m.eld.p99 > max)
                max = m.eld.p99;
        }
        return max;
    }
    /**
     * Start the Prometheus metrics HTTP server.
     * Separate port from the app — not behind SO_REUSEPORT.
     */
    async startServer(port) {
        this.server = createServer((req, res) => {
            if (req.url === '/metrics') {
                const body = this.formatPrometheus();
                res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
                res.end(body);
            }
            else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });
        return new Promise((resolve, reject) => {
            this.server.on('error', reject);
            this.server.listen(port, '0.0.0.0', () => {
                this.server.removeListener('error', reject);
                resolve();
            });
        });
    }
    /** Stop the metrics server. */
    async stopServer() {
        if (!this.server)
            return;
        return new Promise((resolve) => {
            this.server.close(() => resolve());
        });
    }
    /** Format all metrics as Prometheus text exposition format. */
    formatPrometheus() {
        const lines = [];
        const processUptime = process.uptime();
        const processMem = process.memoryUsage();
        // Process-level gauges
        lines.push('# HELP volt_process_uptime_seconds Supervisor process uptime');
        lines.push('# TYPE volt_process_uptime_seconds gauge');
        lines.push(`volt_process_uptime_seconds ${processUptime.toFixed(2)}`);
        lines.push('# HELP volt_process_rss_bytes Supervisor RSS');
        lines.push('# TYPE volt_process_rss_bytes gauge');
        lines.push(`volt_process_rss_bytes ${processMem.rss}`);
        lines.push('# HELP volt_workers_total Current worker count');
        lines.push('# TYPE volt_workers_total gauge');
        lines.push(`volt_workers_total ${this.workerMetrics.size}`);
        // Per-worker gauges
        lines.push('# HELP volt_worker_elu Event loop utilization (0-1)');
        lines.push('# TYPE volt_worker_elu gauge');
        lines.push('# HELP volt_worker_eld_p99_ms Event loop delay p99 in ms');
        lines.push('# TYPE volt_worker_eld_p99_ms gauge');
        lines.push('# HELP volt_worker_heap_used_bytes Worker heap used');
        lines.push('# TYPE volt_worker_heap_used_bytes gauge');
        lines.push('# HELP volt_worker_rss_bytes Worker RSS');
        lines.push('# TYPE volt_worker_rss_bytes gauge');
        // Aggregate gauge for HPA (most important for Kubernetes scaling)
        lines.push('# HELP nodejs_eventloop_lag_seconds Avg event loop delay across workers (for K8s HPA)');
        lines.push('# TYPE nodejs_eventloop_lag_seconds gauge');
        let totalELDMean = 0;
        let count = 0;
        for (const [id, m] of this.workerMetrics) {
            const labels = `worker_id="${id}"`;
            lines.push(`volt_worker_elu{${labels}} ${m.elu.toFixed(4)}`);
            lines.push(`volt_worker_eld_p99_ms{${labels}} ${m.eld.p99.toFixed(2)}`);
            lines.push(`volt_worker_heap_used_bytes{${labels}} ${m.heapUsed}`);
            lines.push(`volt_worker_rss_bytes{${labels}} ${m.rss}`);
            totalELDMean += m.eld.mean;
            count++;
        }
        // Aggregate lag in seconds (for K8s HPA custom metric)
        const avgLagSeconds = count > 0 ? totalELDMean / count / 1000 : 0;
        lines.push(`nodejs_eventloop_lag_seconds ${avgLagSeconds.toFixed(6)}`);
        return lines.join('\n') + '\n';
    }
}
//# sourceMappingURL=collector.js.map