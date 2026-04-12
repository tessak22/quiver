/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    // mcp/tools/*.ts files use ESM-style .js imports (e.g. '../lib/response.js')
    // which TypeScript resolves to the .ts source. Next.js webpack needs the same
    // alias so it can follow the import chain from app/api/mcp/route.ts.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
};

export default nextConfig;
