import { workerData, parentPort } from 'node:worker_threads';
import { EventLoopMonitor } from '../metrics/eventloop-lag.js';
import { loadApp } from './app-loader.js';
import { listenReusePort } from '../transport/reuseport.js';
/**
 * Worker thread entry point.
 *
 * Each worker thread:
 *   1. Loads the user's app via create()
 *   2. Binds HTTP server with SO_REUSEPORT (kernel distributes connections)
 *   3. Starts ELU/ELD monitoring and reports metrics to supervisor
 *   4. Handles shutdown/drain signals from supervisor
 *
 * Communication with supervisor is via parentPort.postMessage().
 */
async function bootstrap() {
    if (!parentPort) {
        throw new Error('[volt] worker-bootstrap must run as a worker_thread');
    }
    const data = workerData;
    const { workerId, appPath, port, host, reusePort, eventLoopInterval, eldResolution, maxEventLoopLag } = data;
    const log = (msg) => console.log(`[volt][worker:${workerId}] ${msg}`);
    const logError = (msg, err) => console.error(`[volt][worker:${workerId}] ${msg}`, err ?? '');
    // Unhandled error handlers — report to supervisor before exiting
    process.on('uncaughtException', (err) => {
        logError('Uncaught exception', err);
        const msg = { type: 'error', workerId, error: String(err) };
        parentPort.postMessage(msg);
        process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
        logError('Unhandled rejection', reason);
        const msg = { type: 'error', workerId, error: String(reason) };
        parentPort.postMessage(msg);
        process.exit(1);
    });
    // 1. Load the user's application
    log(`Loading app from "${appPath}"...`);
    let server;
    try {
        server = await loadApp(appPath);
    }
    catch (err) {
        logError('Failed to load app', err);
        const msg = { type: 'error', workerId, error: String(err) };
        parentPort.postMessage(msg);
        process.exit(1);
        return; // unreachable, keeps TS happy
    }
    // 2. Listen with SO_REUSEPORT (or regular listen on Windows)
    try {
        if (reusePort) {
            await listenReusePort(server, port, host);
            log(`Listening on ${host}:${port} (SO_REUSEPORT)`);
        }
        else {
            await new Promise((resolve, reject) => {
                server.on('error', reject);
                server.listen({ port, host }, () => {
                    server.removeListener('error', reject);
                    resolve();
                });
            });
            log(`Listening on ${host}:${port} (standard)`);
        }
    }
    catch (err) {
        logError('Failed to start HTTP server', err);
        const msg = { type: 'error', workerId, error: String(err) };
        parentPort.postMessage(msg);
        process.exit(1);
        return;
    }
    // 3. Start ELU/ELD event loop monitoring (only if enabled)
    let monitor = null;
    if (eventLoopInterval > 0) {
        monitor = new EventLoopMonitor({
            interval: eventLoopInterval,
            resolution: eldResolution,
            onSample: (metrics) => {
                // Report metrics to supervisor
                const msg = { type: 'metrics', workerId, metrics };
                parentPort.postMessage(msg);
                // Self-healing: if event loop delay is critically high, restart
                if (metrics.eld.p99 > maxEventLoopLag) {
                    logError(`Event loop delay critical: p99=${metrics.eld.p99.toFixed(1)}ms (max=${maxEventLoopLag}ms). Requesting restart.`);
                    process.exit(1); // Supervisor will respawn
                }
            },
        });
        monitor.start();
    }
    // 4. Handle messages from supervisor
    parentPort.on('message', (msg) => {
        switch (msg.type) {
            case 'shutdown':
                log('Received shutdown signal');
                if (monitor)
                    monitor.stop();
                server.close(() => {
                    const reply = { type: 'shutdown-complete', workerId };
                    parentPort.postMessage(reply);
                    process.exit(0);
                });
                // Force exit after 10s if server.close() hangs
                setTimeout(() => process.exit(1), 10_000).unref();
                break;
            case 'drain':
                log('Received drain signal — stopping accept(), finishing in-flight requests');
                server.close(() => {
                    log('All connections drained');
                });
                break;
            case 'ping':
                const pong = { type: 'pong', workerId };
                parentPort.postMessage(pong);
                break;
        }
    });
    // 5. Signal readiness to supervisor
    const ready = { type: 'ready', workerId, port };
    parentPort.postMessage(ready);
    log('Ready');
}
bootstrap().catch((err) => {
    console.error(`[volt] Worker bootstrap fatal error:`, err);
    process.exit(1);
});
//# sourceMappingURL=worker-bootstrap.js.map