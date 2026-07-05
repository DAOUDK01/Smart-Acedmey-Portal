/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid unstable filesystem cache writes in synced folders (e.g. OneDrive)
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
