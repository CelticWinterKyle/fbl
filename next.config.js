/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silence noisy Yahoo Fantasy SDK peer dep warning
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};

module.exports = nextConfig;
