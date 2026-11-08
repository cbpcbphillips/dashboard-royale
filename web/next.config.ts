import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The Databricks SQL driver uses Node-only modules; keep it out of the server bundle.
  serverExternalPackages: ["@databricks/sql"],
  // The Q1 data file is read from disk at runtime (lib/q1.ts); make sure deployments ship it.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }];
  },
};

export default nextConfig;
