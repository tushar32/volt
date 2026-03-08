import { VoltServer } from '../../dist/index.js';

const server = new VoltServer({
  app: './examples/basic/app.js',
  port: 3000,
  workers: 'auto',
  healthCheck: true,
  healthCheckPort: 9091,
  metrics: true,
  metricsPort: 9090,
  gracefulShutdown: 30_000,
});

server.start();
