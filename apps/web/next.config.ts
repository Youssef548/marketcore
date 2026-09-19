import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @app/ui and @app/api-client ship raw TypeScript rather than a build output, so
  // Next compiles them. @app/contracts is deliberately absent: it is built to
  // `dist/` and resolved from there, exactly as the API resolves it.
  transpilePackages: ['@app/ui', '@app/api-client'],
};

export default nextConfig;
