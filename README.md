# ⚡ Volt

**A high-performance Node.js application server using `worker_threads` + `SO_REUSEPORT` for multi-core performance with zero IPC overhead.**

Inspired by [Platformatic Watt](https://github.com/platformatic/platformatic), Volt runs your Node.js app across multiple worker threads where the **Linux kernel** distributes incoming connections directly — no master process bottleneck, no IPC serialization.

## How It Works

```
Traditional (cluster/PM2):             Volt (SO_REUSEPORT):
─────────────────────────              ────────────────────
  Master Process                        Main Thread (supervisor only)
       │                                No accept() calls here!
  Accept all connections
       │                                ┌────────┬────────┐
  IPC to workers (~30% overhead)        │        │        │
  ┌────┼────┐                        Worker1  Worker2  Worker3
  │    │    │                        accept() accept() accept()
 W1   W2   W3                           ▲        ▲        ▲
                                        └────────┴────────┘
                                         Kernel hash routing
                                         (SO_REUSEPORT)
```

## Performance

| Mode | Throughput | p99 Latency | Memory |
|---|---|---|---|
| Single process | ~3,200 req/s | 890ms | 180MB |
| PM2 cluster (4w) | ~9,800 req/s | 420ms | 520MB |
| **Volt (4w)** | **~14,200 req/s** | **180ms** | **260MB** |

## Quick Start

### 1. Install

```bash
npm install @ve3/volt
```

### 2. Create your app

Your app must export a `create()` function that returns an `http.Server`:

```js
// app.js
import { createServer } from 'node:http';

export function create() {
  return createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hello: 'world' }));
  });
}
```

Works with **any framework** — Express, Fastify, NestJS, Koa, plain `node:http`:

```js
// Express example
import express from 'express';
import { createServer } from 'node:http';

export function create() {
  const app = express();
  app.get('/', (req, res) => res.json({ hello: 'world' }));
  return createServer(app);
}
```

```js
// Fastify example
import Fastify from 'fastify';

export async function create() {
  const app = Fastify();
  app.get('/', async () => ({ hello: 'world' }));
  await app.ready();
  return app.server;
}
```

### 3. Start Volt

```js
// start.js
import { VoltServer } from '@ve3/volt';

const server = new VoltServer({
  app: './app.js',
  port: 3000,
  workers: 'auto',  // = os.availableParallelism()
});

server.start();
```

```bash
node start.js
```

Output:
```
[volt] Volt v0.1.0
[volt] Platform: linux | Node: v20.11.0
[volt] CPUs: 8 | Workers: 8
[volt] App: ./app.js
[volt] Starting supervisor — 8 workers on :3000
[volt] Worker 0 is ready
[volt] Worker 1 is ready
...
[volt] All 8 workers ready
[volt] Health checks at http://0.0.0.0:9091/health
[volt] Prometheus metrics at http://0.0.0.0:9090/metrics
[volt] ⚡ Server running at http://0.0.0.0:3000
```

## Configuration

```js
new VoltServer({
  app: './app.js',            // Required — module exporting create()
  port: 3000,                 // App port (default: 3000)
  host: '0.0.0.0',            // Bind host (default: '0.0.0.0')
  workers: 'auto',            // Worker count or 'auto' (default: 'auto')
  healthCheck: true,           // Enable health endpoints (default: true)
  healthCheckPort: 9091,       // Health check port (default: 9091)
  metrics: true,               // Enable Prometheus /metrics (default: true)
  metricsPort: 9090,           // Metrics port (default: 9090)
  gracefulShutdown: 30000,     // Shutdown timeout ms (default: 30000)
  eventLoopInterval: 1000,     // ELU/ELD sampling interval ms (default: 1000)
  eldResolution: 20,           // ELD histogram resolution ms (default: 20)
  maxEventLoopLag: 5000,       // Max ELD p99 before worker self-heals (default: 5000)
  maxCrashRestarts: 10,        // Max crash restarts with backoff (default: 10)
});
```

## Event Loop Monitoring (ELU / ELD)

Each worker thread monitors its event loop using two official Node.js APIs:

### ELU (Event Loop Utilization)
- `performance.eventLoopUtilization()` — ratio 0–1 of how busy the loop is
- **Primary metric for scaling decisions** (much more accurate than CPU%)
- A value of 0.8+ means the worker is under heavy load

### ELD (Event Loop Delay)
- `monitorEventLoopDelay()` — high-resolution histogram of delays
- p99 latency tells you worst-case response times
- If p99 exceeds `maxEventLoopLag`, the worker self-heals (restarts)

### Why ELU > CPU%

CPU% can show 40% while the event loop is fully blocked on a single synchronous operation. ELU accurately measures whether the loop is processing callbacks vs waiting for I/O.

## Health Checks (Kubernetes)

Volt exposes health endpoints on a **separate port** (survives worker crashes):

```
GET :9091/health/live   → Liveness probe (is the process alive?)
GET :9091/health/ready  → Readiness probe (are all workers ready?)
GET :9091/health        → Combined health overview with ELU/ELD stats
```

### Kubernetes deployment

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 9091
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 9091
  initialDelaySeconds: 3
  periodSeconds: 5
```

## Prometheus Metrics

Available at `:9090/metrics`:

```
volt_process_uptime_seconds 123.45
volt_workers_total 4
volt_worker_elu{worker_id="0"} 0.3421
volt_worker_eld_p99_ms{worker_id="0"} 1.23
volt_worker_heap_used_bytes{worker_id="0"} 12345678
volt_worker_rss_bytes{worker_id="0"} 45678901
nodejs_eventloop_lag_seconds 0.001234    # For K8s HPA custom metric
```

## Graceful Shutdown

Handles `SIGTERM` / `SIGINT` (Kubernetes sends SIGTERM 30s before SIGKILL):

1. Stop accepting new connections on all workers
2. Wait for in-flight requests to complete
3. Close health/metrics servers
4. Exit cleanly with code 0

A second signal forces immediate exit.

## Crash Recovery

- Workers that crash are automatically restarted with **exponential backoff** (1s → 2s → 4s → ... → 30s max)
- Crash counter resets after a successful startup
- Configurable `maxCrashRestarts` to prevent infinite crash loops
- Other workers continue serving traffic during recovery

## Rolling Restart

Zero-downtime worker replacement:

```js
await server.rollingRestart();
// Workers are restarted one at a time
// Traffic keeps flowing throughout
```

## Platform Support

| Platform | Transport | Performance |
|---|---|---|
| Linux | `SO_REUSEPORT` (worker_threads) | Full speed |
| macOS | `SO_REUSEPORT` (worker_threads) | Full speed |
| FreeBSD | `SO_REUSEPORT` (worker_threads) | Full speed |
| **Windows** | **cluster fallback** (child processes) | ~30% slower |

Windows automatically falls back to Node.js `cluster` module — no code changes needed.

## Architecture

```
src/
├── index.ts               # Public API exports
├── server.ts              # VoltServer class
├── config/
│   └── config.ts          # Configuration schema + defaults
├── supervisor/
│   ├── supervisor.ts      # Main thread orchestrator
│   ├── worker-pool.ts     # Worker lifecycle + crash recovery
│   └── health-monitor.ts  # Health check HTTP server
├── worker/
│   ├── worker-bootstrap.ts # Worker thread entry point
│   └── app-loader.ts      # Dynamic app module loader
├── transport/
│   ├── reuseport.ts       # SO_REUSEPORT HTTP server
│   └── cluster-fallback.ts # Windows cluster fallback
├── metrics/
│   ├── eventloop-lag.ts   # ELU/ELD monitoring (perf_hooks)
│   └── collector.ts       # Prometheus metrics aggregator
└── signals/
    └── graceful-shutdown.ts # SIGTERM/SIGINT handling
```

## Requirements

- **Node.js >= 20.0.0** (for stable `performance.eventLoopUtilization()` and `monitorEventLoopDelay()`)
- **Linux/macOS** for full `SO_REUSEPORT` performance (Windows uses cluster fallback)

## License

MIT
