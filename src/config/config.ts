import { availableParallelism } from 'node:os';

/**
 * Volt Server Configuration.
 *
 * Users pass this to `new VoltServer(config)`.
 * The app field points to a module exporting a `create()` function
 * that returns an HTTP server (or a promise of one).
 */
export interface VoltServerConfig {
  /** Path to module exporting create() — returns http.Server or Promise<http.Server> */
  app: string;
  /** Port to listen on (default: 3000) */
  port?: number;
  /** Host to bind (default: '0.0.0.0') */
  host?: string;
  /** Number of worker threads, or 'auto' for CPU count (default: 'auto') */
  workers?: number | 'auto';
  /** Enable /health/live and /health/ready endpoints (default: true) */
  healthCheck?: boolean;
  /** Health check port — separate from app port (default: 9091) */
  healthCheckPort?: number;
  /** Enable Prometheus metrics at /metrics (default: true) */
  metrics?: boolean;
  /** Metrics port (default: 9090) */
  metricsPort?: number;
  /** Graceful shutdown timeout in ms (default: 30000) */
  gracefulShutdown?: number;
  /** Logger configuration */
  logger?: LoggerConfig;
  /** Event loop monitoring interval in ms (default: 1000) */
  eventLoopInterval?: number;
  /** ELD histogram resolution in ms (default: 20) */
  eldResolution?: number;
  /** Max event loop lag in ms before worker self-heals (default: 5000) */
  maxEventLoopLag?: number;
  /** Max crash restarts before backoff gives up (default: 10) */
  maxCrashRestarts?: number;
}

export interface LoggerConfig {
  /** Log level (default: 'info') */
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Enable pretty printing (default: false in production) */
  pretty?: boolean;
}

/**
 * Resolved config with all defaults applied.
 */
export interface ResolvedConfig {
  app: string;
  port: number;
  host: string;
  workers: number;
  healthCheck: boolean;
  healthCheckPort: number;
  metrics: boolean;
  metricsPort: number;
  gracefulShutdown: number;
  logger: Required<LoggerConfig>;
  eventLoopInterval: number;
  eldResolution: number;
  maxEventLoopLag: number;
  maxCrashRestarts: number;
}

/**
 * Data passed to each worker thread via workerData.
 */
export interface WorkerBootstrapData {
  workerId: number;
  appPath: string;
  port: number;
  host: string;
  reusePort: boolean;
  eventLoopInterval: number;
  eldResolution: number;
  maxEventLoopLag: number;
  logLevel: string;
}

/**
 * Messages sent between supervisor and worker threads.
 */
export type SupervisorMessage =
  | { type: 'shutdown' }
  | { type: 'drain' }
  | { type: 'ping' };

export type WorkerMessage =
  | { type: 'ready'; workerId: number; port: number }
  | { type: 'shutdown-complete'; workerId: number }
  | { type: 'pong'; workerId: number }
  | { type: 'metrics'; workerId: number; metrics: WorkerMetrics }
  | { type: 'error'; workerId: number; error: string };

export interface WorkerMetrics {
  /** Event Loop Utilization (0–1). Core metric for scaling. */
  elu: number;
  /** Event Loop Delay percentiles in ms */
  eld: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p99: number;
  };
  /** Heap used in bytes */
  heapUsed: number;
  /** Heap total in bytes */
  heapTotal: number;
  /** RSS in bytes */
  rss: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Resolves user config into a fully defaulted config.
 */
export function resolveConfig(raw: VoltServerConfig): ResolvedConfig {
  if (!raw.app) {
    throw new Error('VoltServer: "app" is required — path to module exporting create()');
  }

  const workerCount =
    raw.workers === 'auto' || raw.workers === undefined
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
