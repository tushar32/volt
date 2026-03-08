import express from 'express';
import { createServer } from 'node:http';

/**
 * Realistic Express.js benchmark app.
 * 
 * Simulates a typical REST API with:
 * - JSON parsing
 * - Database-like async operations
 * - CPU-bound work (JSON serialization)
 * - Memory allocation
 */

// Simulate a simple in-memory "database"
const users = Array.from({ length: 1000 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  email: `user${i + 1}@example.com`,
  createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
}));

export function create() {
  const app = express();
  
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Simple endpoint (baseline)
  app.get('/api/ping', (req, res) => {
    res.json({ 
      message: 'pong',
      timestamp: Date.now(),
      pid: process.pid,
    });
  });

  // CPU-bound endpoint (JSON processing)
  app.get('/api/users', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    const results = users.slice(start, end);
    
    res.json({
      page,
      limit,
      total: users.length,
      data: results,
    });
  });

  // Async I/O simulation
  app.get('/api/user/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    
    // Simulate database query delay (1-5ms)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 4 + 1));
    
    const user = users.find(u => u.id === id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  });

  // POST endpoint with validation
  app.post('/api/users', (req, res) => {
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }
    
    const newUser = {
      id: users.length + 1,
      name,
      email,
      createdAt: new Date().toISOString(),
    };
    
    users.push(newUser);
    
    res.status(201).json(newUser);
  });

  // CPU-intensive endpoint (simulate heavy computation)
  app.get('/api/compute', (req, res) => {
    const iterations = parseInt(req.query.iterations) || 1000;
    let result = 0;
    
    for (let i = 0; i < iterations; i++) {
      result += Math.sqrt(i) * Math.sin(i);
    }
    
    res.json({ result, iterations });
  });

  return createServer(app);
}

// For standalone mode (single process)
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = create();
  const PORT = process.env.PORT || 3000;
  
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[single] Express server listening on :${PORT} (pid=${process.pid})`);
  });
}
