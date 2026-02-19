/** @type {import('next').NextConfig} */
const path = require('path');
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  transpilePackages: [
    '@titan/vectordb',
    '@titan/mcp',
    '@titan/security',
    '@titan/repo-map',
    '@titan/midnight',
    '@titan/ai-agents',
    '@titan/ai-speculative',
    '@titan/shadow-sandbox',
  ],
  webpack: (config, { isServer }) => {
    // Handle Monaco Editor + WASM (Tree-sitter)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        buffer: false,
      };
    }

    // Enable WASM support for web-tree-sitter
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Allow .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
