/** @type {import('next').NextConfig} */
const nextConfig = {
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
    // Handle Monaco Editor
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }

    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
