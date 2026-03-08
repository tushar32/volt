import { type VoltServerConfig, type ResolvedConfig } from './config/config.js';
/**
 * VoltServer — high-performance Node.js application server.
 *
 * Uses `worker_threads` + `SO_REUSEPORT` so the Linux kernel distributes
 * incoming TCP connections directly to worker threads — zero IPC overhead.
 *
 * On Windows (no SO_REUSEPORT), falls back to `cluster` module automatically.
 *
 * Usage:
 * ```js
 * import { VoltServer } from '@ve3/volt';
 *
 * const server = new VoltServer({
 *   app: './dist/app.js',   // module exporting create()
 *   workers: 'auto',        // = os.availableParallelism()
 *   port: 3000,
 * });
 *
 * server.start();
 * ```
 *
 * Your app module must export a `create()` function:
 * ```js
 * import { createServer } from 'http';
 *
 * export function create() {
 *   return createServer((req, res) => {
 *     res.writeHead(200);
 *     res.end('Hello from Volt!');
 *   });
 * }
 * ```
 */
export declare class VoltServer {
    private config;
    private supervisor;
    private cleanupSignals;
    constructor(config: VoltServerConfig);
    /**
     * Start the server.
     *
     * On Linux/macOS: spawns N worker threads with SO_REUSEPORT.
     * On Windows: falls back to cluster module (N child processes).
     */
    start(): Promise<void>;
    /**
     * Graceful shutdown — stop all workers and clean up.
     */
    shutdown(): Promise<void>;
    /**
     * Rolling restart — zero-downtime worker replacement.
     */
    rollingRestart(): Promise<void>;
    /** Check if all workers are ready. */
    isReady(): boolean;
    /** Get the resolved config. */
    getConfig(): ResolvedConfig;
}
//# sourceMappingURL=server.d.ts.map