import { availableParallelism } from 'node:os';
import {
  resolveConfig,
  type VoltServerConfig,
  type ResolvedConfig,
} from './config/config.js';
import { Supervisor } from './supervisor/supervisor.js';
import { isReusePortSupported } from './transport/reuseport.js';
import { startWithCluster } from './transport/cluster-fallback.js';
import { setupGracefulShutdown } from './signals/graceful-shutdown.js';

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
export class VoltServer {
  private config: ResolvedConfig;
  private supervisor: Supervisor | null = null;
  private cleanupSignals: (() => void) | null = null;

  constructor(config: VoltServerConfig) {
    this.config = resolveConfig(config);
  }

  /**
   * Start the server.
   *
   * On Linux/macOS: spawns N worker threads with SO_REUSEPORT.
   * On Windows: falls back to cluster module (N child processes).
   */
  async start(): Promise<void> {
    const { config } = this;

    console.log(`[volt] Volt v0.1.0`);
    console.log(`[volt] Platform: ${process.platform} | Node: ${process.version}`);
    console.log(`[volt] CPUs: ${availableParallelism()} | Workers: ${config.workers}`);
    console.log(`[volt] App: ${config.app}`);

    if (!isReusePortSupported()) {
      // Windows fallback — uses cluster module
      console.log('[volt] SO_REUSEPORT not supported — using cluster fallback');
      await startWithCluster(config);
      return;
    }

    // Linux/macOS — worker_threads + SO_REUSEPORT
    this.supervisor = new Supervisor(config);

    // Setup graceful shutdown before starting workers
    this.cleanupSignals = setupGracefulShutdown(
      () => this.shutdown(),
      config.gracefulShutdown
    );

    await this.supervisor.start();
  }

  /**
   * Graceful shutdown — stop all workers and clean up.
   */
  async shutdown(): Promise<void> {
    if (this.supervisor) {
      await this.supervisor.shutdown();
    }
    if (this.cleanupSignals) {
      this.cleanupSignals();
    }
  }

  /**
   * Rolling restart — zero-downtime worker replacement.
   */
  async rollingRestart(): Promise<void> {
    if (!this.supervisor) {
      throw new Error('[volt] Cannot rolling restart — server not started');
    }
    await this.supervisor.rollingRestart();
  }

  /** Check if all workers are ready. */
  isReady(): boolean {
    return this.supervisor?.isReady() ?? false;
  }

  /** Get the resolved config. */
  getConfig(): ResolvedConfig {
    return this.config;
  }
}
