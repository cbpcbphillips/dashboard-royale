import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The Databricks SQL driver uses Node-only modules; keep it out of the server bundle.
  serverExternalPackages: ["@databricks/sql"],
  // The Q1 data file is read from disk at runtime (lib/q1.ts); make sure deployments ship it.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
};

export default nextConfig;
