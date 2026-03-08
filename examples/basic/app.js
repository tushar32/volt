import { createServer } from 'node:http';
import { threadId } from 'node:worker_threads';

/**
 * Example app for Volt.
 *
 * Export a create() function that returns an http.Server.
 * Volt will call this in each worker thread and bind it
 * with SO_REUSEPORT so the kernel distributes connections.
 */
export function create() {
  let requestCount = 0;

  const server = createServer((req, res) => {
    requestCount++;

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        message: 'Hello from Volt!',
        pid: process.pid,
        threadId,
        requests: requestCount,
        timestamp: new Date().toISOString(),
      })
    );
  });

  return server;
}
