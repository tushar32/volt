import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReusePortSupported } from '../transport/reuseport.js';
const WORKER_BOOTSTRAP_PATH = join(fileURLToPath(import.meta.url), '../../worker/worker-bootstrap.js');
/**
 * Manages the lifecycle of worker threads:
 *   - Spawning with workerData (app path, port, SO_REUSEPORT flag)
 *   - Auto-restarting on crash with exponential backoff
 *   - Handling worker messages (ready, metrics, shutdown-complete)
 *   - Draining and graceful shutdown of all workers
 */
export class WorkerPool {
    workers = new Map();
    config;
    metricsCollector;
    events;
    shuttingDown = false;
    reusePort;
    constructor(config, metricsCollector, events) {
        this.config = config;
        this.metricsCollector = metricsCollector;
        this.events = events;
        this.reusePort = isReusePortSupported();
    }
    /**
     * Spawn all configured workers.
     * Returns when all workers have sent the 'ready' message.
     */
    async spawnAll() {
        const readyPromises = [];
        for (let i = 0; i < this.config.workers; i++) {
            readyPromises.push(this.spawnWorker(i));
        }
        await Promise.all(readyPromises);
    }
    /**
     * Spawn a single worker thread and wait for its 'ready' signal.
     */
    async spawnWorker(id) {
        const existing = this.workers.get(id);
        const workerData = {
            workerId: id,
            appPath: this.config.app,
            port: this.config.port,
            host: this.config.host,
            reusePort: this.reusePort,
            eventLoopInterval: this.config.eventLoopInterval,
            eldResolution: this.config.eldResolution,
            maxEventLoopLag: this.config.maxEventLoopLag,
            logLevel: this.config.logger.level,
        };
        const worker = new Worker(WORKER_BOOTSTRAP_PATH, { workerData });
        const managed = {
            id,
            worker,
            status: 'starting',
            startTime: Date.now(),
            crashCount: existing?.crashCount ?? 0,
        };
        this.workers.set(id, managed);
        // Handle worker errors
        worker.on('error', (err) => {
            console.error(`[volt] Worker ${id} error:`, err);
            this.events.onError(id, String(err));
        });
        // Handle worker exit — auto-restart on crash
        worker.on('exit', (code) => {
            managed.status = 'exited';
            this.metricsCollector.remove(id);
            this.events.onExit(id, code);
            if (code !== 0 && !this.shuttingDown) {
                managed.crashCount++;
                if (managed.crashCount > this.config.maxCrashRestarts) {
                    console.error(`[volt] Worker ${id} exceeded max crash restarts (${this.config.maxCrashRestarts}). Not restarting.`);
                    return;
                }
                // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
                const delay = Math.min(1000 * Math.pow(2, managed.crashCount - 1), 30_000);
                console.log(`[volt] Worker ${id} crashed (code=${code}), restarting in ${delay}ms (attempt ${managed.crashCount}/${this.config.maxCrashRestarts})...`);
                setTimeout(() => {
                    if (!this.shuttingDown) {
                        this.spawnWorker(id).catch((err) => {
                            console.error(`[volt] Failed to restart worker ${id}:`, err);
                        });
                    }
                }, delay);
            }
        });
        // Handle all worker messages (ready, metrics, errors, etc.)
        worker.on('message', (msg) => {
            this.handleMessage(id, msg);
        });
        // Wait for ready signal
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`[volt] Worker ${id} did not become ready within 60s`));
            }, 60_000);
            const onReady = (msg) => {
                if (msg.type === 'ready' && msg.workerId === id) {
                    clearTimeout(timeout);
                    worker.removeListener('message', onReady);
                    managed.status = 'ready';
                    managed.crashCount = 0; // Reset on successful start
                    resolve();
                }
                if (msg.type === 'error' && msg.workerId === id) {
                    clearTimeout(timeout);
                    worker.removeListener('message', onReady);
                    reject(new Error(msg.error));
                }
            };
            worker.on('message', onReady);
        });
    }
    /**
     * Graceful shutdown: signal all workers, wait for confirmation.
     */
    async shutdown(timeoutMs) {
        this.shuttingDown = true;
        // Send shutdown to all workers
        for (const [id, managed] of this.workers) {
            if (managed.status === 'ready') {
                managed.status = 'stopping';
                managed.worker.postMessage({ type: 'shutdown' });
            }
        }
        // Wait for all shutdown-complete messages (or timeout)
        const waitForAll = new Promise((resolve) => {
            const check = () => {
                const anyAlive = [...this.workers.values()].some((w) => w.status !== 'exited');
                if (!anyAlive)
                    resolve();
                else
                    setTimeout(check, 100);
            };
            check();
        });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('[volt] Graceful shutdown timeout')), timeoutMs));
        try {
            await Promise.race([waitForAll, timeout]);
        }
        catch {
            // Force-terminate remaining workers
            console.error('[volt] Forcing remaining workers to terminate');
            for (const managed of this.workers.values()) {
                if (managed.status !== 'exited') {
                    await managed.worker.terminate();
                }
            }
        }
    }
    /**
     * Rolling restart: restart workers one at a time to maintain availability.
     */
    async rollingRestart() {
        for (const [id] of this.workers) {
            const managed = this.workers.get(id);
            if (!managed || managed.status !== 'ready')
                continue;
            // Shutdown old worker
            managed.worker.postMessage({ type: 'shutdown' });
            await this.waitForExit(id, 10_000);
            // Spawn replacement
            await this.spawnWorker(id);
            // Brief delay between restarts
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    /** Check if all workers are ready. */
    allReady() {
        if (this.workers.size === 0)
            return false;
        return [...this.workers.values()].every((w) => w.status === 'ready');
    }
    /** Get the number of ready workers. */
    readyCount() {
        return [...this.workers.values()].filter((w) => w.status === 'ready').length;
    }
    /** Get total worker count. */
    totalCount() {
        return this.workers.size;
    }
    /** Ping all workers (for health checks). */
    pingAll() {
        for (const managed of this.workers.values()) {
            if (managed.status === 'ready') {
                managed.worker.postMessage({ type: 'ping' });
            }
        }
    }
    handleMessage(id, msg) {
        switch (msg.type) {
            case 'ready':
                this.events.onReady(id);
                break;
            case 'metrics':
                this.metricsCollector.record(id, msg.metrics);
                break;
            case 'shutdown-complete':
                const managed = this.workers.get(id);
                if (managed)
                    managed.status = 'exited';
                break;
            case 'pong':
                // Health check response — worker is alive
                break;
            case 'error':
                this.events.onError(id, msg.error);
                break;
        }
    }
    waitForExit(id, timeoutMs) {
        return new Promise((resolve) => {
            const managed = this.workers.get(id);
            if (!managed || managed.status === 'exited') {
                resolve();
                return;
            }
            const timeout = setTimeout(() => {
                managed.worker.terminate().then(() => resolve());
            }, timeoutMs);
            managed.worker.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
}
//# sourceMappingURL=worker-pool.js.map