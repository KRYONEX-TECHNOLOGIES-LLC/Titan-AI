/** @type {import('next').NextConfig} */
const path = require('path');
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  transpilePackages: [
    '@titan/core-editor',
    '@titan/core-workspace',
    '@titan/ai-gateway',
    '@titan/ui-primitives',
    '@titan/ui-editor',
    '@titan/ui-sidebar',
    '@titan/ui-terminal',
    '@titan/ui-status-bar',
    '@titan/ui-chat',
    '@titan/ui-layouts',
    '@titan/ui-themes',
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
