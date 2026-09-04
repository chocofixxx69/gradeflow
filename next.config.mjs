/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
  async redirects() {
    return [
      { source: '/faculty/analytics/leaderboard', destination: '/faculty/analytics/merit?tab=leaderboard', permanent: false },
      { source: '/faculty/analytics/merit-list', destination: '/faculty/analytics/merit?tab=merit', permanent: false },
      { source: '/faculty/analytics/eligibility', destination: '/faculty/analytics/compliance?tab=eligibility', permanent: false },
      { source: '/faculty/analytics/backlogs', destination: '/faculty/analytics/compliance?tab=backlogs', permanent: false },
      { source: '/faculty/analytics/semester-analysis', destination: '/faculty/analytics/results?tab=semester', permanent: false },
      { source: '/faculty/analytics/batch-report', destination: '/faculty/analytics/results?tab=batch', permanent: false },
      { source: '/faculty/analytics/reval-impact', destination: '/faculty/analytics/results?tab=reval', permanent: false },
      { source: '/faculty/analytics/department', destination: '/faculty/analytics/intelligence?tab=department', permanent: false },
      { source: '/faculty/analytics/sections-compare', destination: '/faculty/analytics/intelligence?tab=sections', permanent: false },
      { source: '/faculty/analytics/cohort-trends', destination: '/faculty/analytics/intelligence?tab=department', permanent: false },
      { source: '/faculty/analytics/compare', destination: '/faculty/analytics/intelligence?tab=compare', permanent: false },
    ];
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


