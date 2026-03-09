/**
 * Benchmark Mode 3: PM2 Cluster
 * 
 * Uses PM2's cluster mode (child processes).
 * Master process distributes via round-robin IPC.
 * ~30% overhead vs SO_REUSEPORT.
 */
const os = require('os');

module.exports = {
  apps: [{
    name: 'express-pm2',
    script: './benchmarks/express-app-pm2.cjs',
    instances: process.env.WORKERS || os.availableParallelism(),
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '500M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
  }],
};
