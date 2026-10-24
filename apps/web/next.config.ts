import type { NextConfig } from 'next';

/**
 * Headers that hold the browser to first-party behaviour.
 *
 * Frame protection is the load-bearing one: this app authorizes writes with cookies
 * that `SameSite=Lax` does not withhold from a same-origin request, and a click
 * inside a frame is same-origin — so without a frame-ancestors rule, another site can
 * frame the checkout and ride the victim's own clicks. There is no CSP elsewhere and
 * Next adds neither header, so they belong here rather than in the Caddyfile, which
 * only the e2e harness uses.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
] as const;

const nextConfig: NextConfig = {
  // @app/ui and @app/api-client ship raw TypeScript rather than a build output, so
  // Next compiles them. @app/contracts is deliberately absent: it is built to
  // `dist/` and resolved from there, exactly as the API resolves it.
  transpilePackages: ['@app/ui', '@app/api-client'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
