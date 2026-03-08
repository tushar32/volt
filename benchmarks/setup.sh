#!/bin/bash

# Benchmark Setup Script for Linux/WSL2/macOS
# Run this in your Linux environment to prepare for benchmarks

set -e

echo "🔧 Volt Benchmark Setup"
echo "======================="
echo ""

# Check platform
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "❌ ERROR: You're running on Windows!"
    echo ""
    echo "SO_REUSEPORT requires Linux/macOS. Please use:"
    echo "  1. WSL2: wsl --install, then run this script inside WSL"
    echo "  2. Linux VM or server"
    echo "  3. macOS"
    echo ""
    exit 1
fi

echo "✅ Platform: $OSTYPE"
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ ERROR: Node.js >= 20 required (you have $(node -v))"
    exit 1
fi
echo "✅ Node.js: $(node -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
npm install express pm2 autocannon --save-dev

# Build Volt
echo "🔨 Building Volt..."
npm run build

# Create logs directory
mkdir -p logs

echo ""
echo "✅ Setup complete!"
echo ""
echo "📊 Run benchmarks:"
echo "  node benchmarks/run-benchmark.js"
echo ""
echo "Or test manually:"
echo "  node benchmarks/single.js    # Single mode"
echo "  node benchmarks/volt.js      # Volt (SO_REUSEPORT)"
echo "  npx pm2 start benchmarks/pm2.config.cjs  # PM2 cluster"
echo ""
