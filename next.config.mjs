import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Legal Hub: specific paths before catch-all
      { source: '/legal-hub/templates', destination: '/legal/templates', permanent: true },
      { source: '/legal-hub/firm', destination: '/legal/firm', permanent: true },
      { source: '/legal-hub/:id', destination: '/legal/cases/:id', permanent: true },
      { source: '/legal-hub', destination: '/legal/cases', permanent: true },
      // Contracts Hub
      { source: '/obligations', destination: '/contracts/obligations', permanent: true },
      { source: '/contracts/new', destination: '/contracts/list/new', permanent: true },
      // Documents Hub
      { source: '/document-tools', destination: '/documents/ai-tools', permanent: true },
      { source: '/ask', destination: '/documents/ai-tools', permanent: true },
    ];
  },
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

export default withNextIntl(nextConfig);
