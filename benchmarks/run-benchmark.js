#!/usr/bin/env node
import autocannon from 'autocannon';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Automated benchmark runner.
 * 
 * Tests all three modes sequentially:
 * 1. Single Express process
 * 2. Volt (SO_REUSEPORT)
 * 3. PM2 cluster
 * 
 * Usage:
 *   node benchmarks/run-benchmark.js
 */

const WARMUP_DURATION = 5; // seconds
const TEST_DURATION = 30; // seconds
const CONNECTIONS = 100;
const PIPELINING = 10;

const ENDPOINTS = [
  { path: '/api/ping', name: 'Simple JSON' },
  { path: '/api/users?page=1&limit=20', name: 'Paginated List' },
  { path: '/api/user/42', name: 'Single Record (async)' },
  { path: '/api/compute?iterations=1000', name: 'CPU-bound' },
];

const results = {};

async function runAutocannon(url, name) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log(`${'='.repeat(60)}\n`);

  const result = await autocannon({
    url,
    connections: CONNECTIONS,
    pipelining: PIPELINING,
    duration: TEST_DURATION,
    title: name,
  });

  return {
    requests: {
      total: result.requests.total,
      average: result.requests.average,
      mean: result.requests.mean,
      p50: result.latency.p50,
      p95: result.latency.p95,
      p99: result.latency.p99,
    },
    throughput: {
      total: result.throughput.total,
      average: result.throughput.average,
    },
    latency: {
      mean: result.latency.mean,
      p50: result.latency.p50,
      p95: result.latency.p95,
      p99: result.latency.p99,
      p999: result.latency.p999,
    },
    errors: result.errors,
    timeouts: result.timeouts,
  };
}

async function startServer(mode) {
  console.log(`\n🚀 Starting server in ${mode.toUpperCase()} mode...`);
  
  let proc;
  
  if (mode === 'single') {
    proc = spawn('node', ['benchmarks/single.js'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: '3000' },
    });
  } else if (mode === 'volt') {
    proc = spawn('node', ['benchmarks/volt.js'], {
      stdio: 'inherit',
      env: { ...process.env },
    });
  } else if (mode === 'pm2') {
    proc = spawn('npx', ['pm2', 'start', 'benchmarks/pm2.config.cjs'], {
      stdio: 'inherit',
      shell: true,
    });
  }

  // Wait for server to be ready
  console.log('⏳ Waiting for server to start...');
  await sleep(5000);

  // Warmup
  console.log(`🔥 Warming up for ${WARMUP_DURATION}s...`);
  await autocannon({
    url: 'http://localhost:3000/api/ping',
    connections: 10,
    duration: WARMUP_DURATION,
  });

  return proc;
}

async function stopServer(mode, proc) {
  console.log(`\n🛑 Stopping ${mode.toUpperCase()} server...`);
  
  if (mode === 'pm2') {
    await new Promise((resolve) => {
      const stop = spawn('npx', ['pm2', 'delete', 'all'], {
        stdio: 'inherit',
        shell: true,
      });
      stop.on('close', resolve);
    });
  } else if (proc) {
    proc.kill('SIGTERM');
    await sleep(2000);
    if (!proc.killed) {
      proc.kill('SIGKILL');
    }
  }

  await sleep(3000); // Cool down
}

async function benchmarkMode(mode) {
  const proc = await startServer(mode);
  const modeResults = {};

  for (const endpoint of ENDPOINTS) {
    const url = `http://localhost:3000${endpoint.path}`;
    const testName = `${mode} - ${endpoint.name}`;
    
    try {
      modeResults[endpoint.name] = await runAutocannon(url, testName);
    } catch (err) {
      console.error(`❌ Error testing ${testName}:`, err.message);
      modeResults[endpoint.name] = { error: err.message };
    }

    await sleep(2000); // Brief pause between endpoints
  }

  await stopServer(mode, proc);
  return modeResults;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Volt Performance Benchmark Suite                  ║
║                                                            ║
║  Comparing:                                                ║
║    1. Single Express process (baseline)                   ║
║    2. Volt (worker_threads + SO_REUSEPORT)                ║
║    3. PM2 cluster mode                                     ║
╚═══════════════════════════════════════════════════════════╝

Configuration:
  - Duration: ${TEST_DURATION}s per test
  - Connections: ${CONNECTIONS}
  - Pipelining: ${PIPELINING}
  - Warmup: ${WARMUP_DURATION}s
`);

  const modes = ['single', 'volt', 'pm2'];

  for (const mode of modes) {
    console.log(`\n\n${'█'.repeat(60)}`);
    console.log(`  MODE: ${mode.toUpperCase()}`);
    console.log(`${'█'.repeat(60)}`);
    
    results[mode] = await benchmarkMode(mode);
  }

  // Print comparison table
  console.log('\n\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                   BENCHMARK RESULTS                        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  for (const endpoint of ENDPOINTS) {
    console.log(`\n📊 ${endpoint.name.toUpperCase()}`);
    console.log('─'.repeat(80));
    console.log(
      'Mode'.padEnd(15),
      'Req/s'.padEnd(12),
      'p50 (ms)'.padEnd(12),
      'p99 (ms)'.padEnd(12),
      'Errors'
    );
    console.log('─'.repeat(80));

    for (const mode of modes) {
      const data = results[mode][endpoint.name];
      if (data?.error) {
        console.log(`${mode.padEnd(15)} ERROR: ${data.error}`);
      } else if (data) {
        console.log(
          mode.padEnd(15),
          data.requests.mean.toFixed(0).padEnd(12),
          data.latency.p50.toFixed(2).padEnd(12),
          data.latency.p99.toFixed(2).padEnd(12),
          data.errors.toString()
        );
      }
    }
  }

  // Calculate improvement percentages
  console.log('\n\n📈 PERFORMANCE IMPROVEMENT vs SINGLE MODE\n');
  console.log('─'.repeat(60));
  
  for (const endpoint of ENDPOINTS) {
    const single = results.single[endpoint.name];
    const volt = results.volt[endpoint.name];
    const pm2 = results.pm2[endpoint.name];

    if (single && volt && pm2) {
      const voltImprovement = ((volt.requests.mean - single.requests.mean) / single.requests.mean * 100).toFixed(1);
      const pm2Improvement = ((pm2.requests.mean - single.requests.mean) / single.requests.mean * 100).toFixed(1);
      
      console.log(`${endpoint.name}:`);
      console.log(`  Volt:  ${voltImprovement > 0 ? '+' : ''}${voltImprovement}% throughput`);
      console.log(`  PM2:   ${pm2Improvement > 0 ? '+' : ''}${pm2Improvement}% throughput`);
      console.log();
    }
  }

  console.log('\n✅ Benchmark complete!\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
