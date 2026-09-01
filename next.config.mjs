/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: false,
      };
    }
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        canvas: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;


