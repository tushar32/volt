/**
 * Graceful shutdown signal handler.
 *
 * Kubernetes sends SIGTERM 30 seconds before SIGKILL.
 * This handler ensures:
 *   1. Workers stop accepting new connections
 *   2. In-flight requests are completed
 *   3. Health/metrics servers are closed
 *   4. Process exits cleanly with code 0
 *
 * A second SIGTERM/SIGINT forces immediate exit.
 */
export declare function setupGracefulShutdown(shutdownFn: () => Promise<void>, timeoutMs?: number): () => void;
//# sourceMappingURL=graceful-shutdown.d.ts.map