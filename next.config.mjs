/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // sql.js needs special handling for WASM
      config.externals.push({
        'sql.js': 'commonjs sql.js',
      });
    }
    return config;
  },
  // Allow large request bodies for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
