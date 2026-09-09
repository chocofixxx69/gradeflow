/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
  // This app has 3 portals (student/faculty/admin) each with dozens of routes,
  // and it's normal to have many tabs open against the same dev server at once.
  // The default dev buffer only keeps ~5 compiled pages warm, so extra tabs
  // constantly evict and recompile each other's routes — under heavy concurrent
  // load that churn has caused the dev route manifest to desync (previously-working
  // routes returning stale 404s until a full server restart). Widening the buffer
  // and how long an inactive page stays compiled avoids that thrashing. No effect
  // on production builds.
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 20,
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


