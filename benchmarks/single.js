/**
 * Benchmark Mode 1: Single Express process (baseline)
 * 
 * Traditional single-threaded Node.js server.
 * Only uses 1 CPU core.
 */
import { create } from './express-app.js';

const server = create();
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SINGLE MODE] Express server on :${PORT} (pid=${process.pid})`);
  console.log('Using 1 CPU core');
});
