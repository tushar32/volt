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
export function setupGracefulShutdown(
  shutdownFn: () => Promise<void>,
  timeoutMs: number = 30_000
): () => void {
  let shuttingDown = false;

  const handler = async (signal: string) => {
    if (shuttingDown) {
      console.log(`[volt] Received ${signal} again — forcing exit`);
      process.exit(1);
    }

    shuttingDown = true;
    console.log(`[volt] Received ${signal} — starting graceful shutdown...`);

    const forceTimer = setTimeout(() => {
      console.error(
        `[volt] Graceful shutdown timed out after ${timeoutMs}ms — forcing exit`
      );
      process.exit(1);
    }, timeoutMs);
    forceTimer.unref();

    try {
      await shutdownFn();
      console.log('[volt] Shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('[volt] Error during shutdown:', err);
      process.exit(1);
    }
  };

  const onSigterm = () => handler('SIGTERM');
  const onSigint = () => handler('SIGINT');

  process.on('SIGTERM', onSigterm);
  process.on('SIGINT', onSigint);

  // Return cleanup function to remove handlers
  return () => {
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  };
}
