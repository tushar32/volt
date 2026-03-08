import { createServer, type Server, type RequestListener } from 'node:http';

/**
 * Creates an HTTP server that binds with SO_REUSEPORT.
 *
 * SO_REUSEPORT allows multiple sockets (one per worker thread) to bind
 * the same IP:port. The **kernel** distributes incoming connections
 * using a 4-tuple hash — zero IPC overhead.
 *
 * Platform support:
 *   Linux   ✅  (kernel 3.9+)
 *   macOS   ✅  (via SO_REUSEPORT_LB)
 *   FreeBSD ✅  (12.0+)
 *   Windows ❌  — falls back to cluster module
 */
export function createReusePortServer(
  requestListener: RequestListener
): Server {
  return createServer(requestListener);
}

/**
 * Start listening with SO_REUSEPORT enabled.
 * On platforms that don't support it, Node.js will throw — the caller
 * must catch and fall back to cluster mode.
 */
export function listenReusePort(
  server: Server,
  port: number,
  host: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    server.on('error', reject);

    server.listen(
      {
        port,
        host,
        reusePort: true, // ← SO_REUSEPORT at kernel level
      },
      () => {
        server.removeListener('error', reject);
        resolve();
      }
    );
  });
}

/**
 * Checks at runtime whether SO_REUSEPORT is available on this platform.
 * Windows never supports it; other platforms depend on kernel version.
 */
export function isReusePortSupported(): boolean {
  return process.platform !== 'win32';
}
