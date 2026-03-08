import { availableParallelism } from 'node:os';
/**
 * Resolves user config into a fully defaulted config.
 */
export function resolveConfig(raw) {
    if (!raw.app) {
        throw new Error('VoltServer: "app" is required — path to module exporting create()');
    }
    const workerCount = raw.workers === 'auto' || raw.workers === undefined
        ? availableParallelism()
        : raw.workers;
    if (typeof workerCount === 'number' && (workerCount < 1 || !Number.isInteger(workerCount))) {
        throw new Error('VoltServer: "workers" must be a positive integer or "auto"');
    }
    return {
        app: raw.app,
        port: raw.port ?? 3000,
        host: raw.host ?? '0.0.0.0',
        workers: workerCount,
        healthCheck: raw.healthCheck ?? true,
        healthCheckPort: raw.healthCheckPort ?? 9091,
        metrics: raw.metrics ?? true,
        metricsPort: raw.metricsPort ?? 9090,
        gracefulShutdown: raw.gracefulShutdown ?? 30_000,
        logger: {
            level: raw.logger?.level ?? 'info',
            pretty: raw.logger?.pretty ?? (process.env.NODE_ENV !== 'production'),
        },
        eventLoopInterval: raw.eventLoopInterval ?? 1000,
        eldResolution: raw.eldResolution ?? 20,
        maxEventLoopLag: raw.maxEventLoopLag ?? 5000,
        maxCrashRestarts: raw.maxCrashRestarts ?? 10,
    };
}
//# sourceMappingURL=config.js.map